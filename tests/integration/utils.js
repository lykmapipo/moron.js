var _ = require('lodash');
var Promise = require('bluebird');
var MoronModel = require('../../lib/MoronModel');

module.exports.initialize = function (opt) {
  function Model1() {
    MoronModel.apply(this, arguments);
  }

  function Model2() {
    MoronModel.apply(this, arguments);
  }

  MoronModel.makeSubclass(Model1);
  MoronModel.makeSubclass(Model2);

  Model1.tableName = 'Model1';
  Model2.tableName = 'model_2';

  Model2.prototype.$formatDatabaseJson = function (json) {
    json = MoronModel.prototype.$formatDatabaseJson.call(this, json);

    return _.mapKeys(json, function (value, key) {
      return _.snakeCase(key);
    });
  };

  Model2.prototype.$parseDatabaseJson = function (json) {
    json = _.mapKeys(json, function (value, key) {
      return _.camelCase(key);
    });

    return MoronModel.prototype.$parseDatabaseJson.call(this, json);
  };

  Model1.relationMappings = {
    model1Relation1: {
      relation: MoronModel.HasOneRelation,
      modelClass: Model1,
      join: {
        from: 'Model1.model1Id',
        to: 'Model1.id'
      }
    },
    model1Relation2: {
      relation: MoronModel.HasManyRelation,
      modelClass: Model2,
      join: {
        from: 'Model1.id',
        to: 'model_2.model_1_id'
      }
    }
  };

  Model2.relationMappings = {
    model2Relation1: {
      relation: MoronModel.ManyToManyRelation,
      modelClass: Model1,
      join: {
        from: 'model_2.id_col',
        through: {
          from: 'Model1Model2.model2Id',
          to: 'Model1Model2.model1Id'
        },
        to: 'Model1.id'
      }
    }
  };

  var knex = require('knex')(opt.knexConfig);

  Model1.knex = knex;
  Model2.knex = knex;

  Model1.idColumn = 'id';
  Model2.idColumn = 'id_col';

  return {
    opt: opt,
    knex: knex,
    models: {
      Model1: Model1,
      Model2: Model2
    },
    createDb: module.exports.createDb,
    populate: module.exports.populate,
    destroy: module.exports.destroy
  };
};

module.exports.createDb = function () {
  var session = this;

  return session.knex.schema
    .dropTableIfExists('Model1')
    .dropTableIfExists('model_2')
    .dropTableIfExists('Model1Model2')
    .createTable('Model1', function (table) {
      table.bigincrements('id');
      table.biginteger('model1Id');
      table.string('model1Prop1');
      table.integer('model1Prop2');
    })
    .createTable('model_2', function (table) {
      table.bigincrements('id_col');
      table.biginteger('model_1_id');
      table.string('model_2_prop_1');
      table.integer('model_2_prop_2');
    })
    .createTable('Model1Model2', function (table) {
      table.bigincrements('id');
      table.biginteger('model1Id').notNullable();
      table.biginteger('model2Id').notNullable();
    });
};

module.exports.destroy = function () {
  return this.knex.destroy();
};

module.exports.populate = function (data) {
  var rows = {};
  var models = this.models;
  var session = this;

  _.each(data, function (jsonModel) {
    createRows(jsonModel, models.Model1, rows);
  });

  return Promise.all(_.map(rows, function (rows, table) {
    return session.knex(table).delete().then(function () {
      return session.knex(table).insert(rows);
    }).then(function () {
      var idCol = (_.find(session.models, {tableName: table}) || {idColumn: 'id'}).idColumn;
      var maxId = _.max(_.pluck(rows, idCol));

      if (session.opt.knexConfig.client === 'sqlite3') {
        if (maxId && _.isFinite(maxId)) {
          return session.knex.raw('UPDATE sqlite_sequence SET seq = ' + maxId + ' WHERE name = "' + table + '"');
        }
      } else {
        throw new Error('not yet implemented');
      }
    });
  })).then(function () {
    return {
      rows: rows,
      tree: data
    };
  })
};

function createRows(model, ModelClass, rows) {
  var relations = ModelClass.getRelations();
  model = ModelClass.ensureModel(model);

  _.each(relations, function (relation, relationName) {
    if (!_.has(model, relationName)) {
      return;
    }

    if (relation instanceof MoronModel.HasOneRelation) {

      var related = relation.relatedModelClass.ensureModel(model[relationName]);
      model[relation.ownerProp] = related.$id();

      createRows(related, relation.relatedModelClass, rows);

    } else if (relation instanceof MoronModel.HasManyRelation) {

      _.each(model[relationName], function (relatedJson) {
        var related = relation.relatedModelClass.ensureModel(relatedJson);
        related[relation.relatedProp] = model.$id();

        createRows(related, relation.relatedModelClass, rows);
      });

    } else if (relation instanceof MoronModel.ManyToManyRelation) {
      var joinTable = [ModelClass.name, relation.relatedModelClass.name].sort().join('');

      _.each(model[relationName], function (relatedJson) {
        var joinRow = {};
        var related = relation.relatedModelClass.ensureModel(relatedJson);

        joinRow[relation.joinTableRelatedCol] = related.$id();
        joinRow[relation.joinTableOwnerCol] = model.$id();

        rows[joinTable] = rows[joinTable] || [];
        rows[joinTable].push(joinRow);

        createRows(related, relation.relatedModelClass, rows);
      });
    } else {
      throw new Error('unsupported relation type');
    }
  });

  rows[ModelClass.tableName] = rows[ModelClass.tableName] || [];
  rows[ModelClass.tableName].push(model.$toDatabaseJson());
}
