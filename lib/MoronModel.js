"use strict";

var _ = require('lodash')
  , MoronModelBase = require('./MoronModelBase')
  , MoronQueryBuilder = require('./MoronQueryBuilder')
  , MoronRelationExpression = require('./MoronRelationExpression')
  , MoronValidationError = require('./MoronValidationError')
  , MoronEagerFetcher = require('./MoronEagerFetcher')
  , MoronRelation = require('./relations/MoronRelation')
  , MoronHasOneRelation = require('./relations/MoronHasOneRelation')
  , MoronHasManyRelation = require('./relations/MoronHasManyRelation')
  , MoronManyToManyRelation = require('./relations/MoronManyToManyRelation');

/**
 *
 * Resource
 *  .query()
 *  .join('Product', 'Product.id', 'Resource.productId')
 *  .where('Product.name', '4hh')
 *  .orWhere(function () {
 *    this.where('Resource.id', 1).where('Resource.age', 10);
 *  });
 *
 * Resource
 *  .query()
 *  .patch({a:10})
 *  .where('size', '<', 10);
 *
 * resource.$query().insert();
 * resource.$query().update();
 *
 * resource.$relatedQuery('products').where('id', 100).patch({a:10});
 * resource.$relatedQuery('products').delete();
 *
 * MoronModel.transaction(Resource, Product, Quota, function (Resource, Product, Quota) {
 *   Resource.
 * });
 *
 *
 * 'a(id,name,age){name > 10, type = 5}.b.c.[d(age).e(surname), f(name)]
 *
 * {
 *   $relation: 'a',
 *   $select: ['id', 'name', 'age'],
 *   $where: ['name >
 *   $subRelations: [{
 *     $relation; 'b'
 *     $select: ['*'],
 *   }]
 * }
 *
 * //////////
 *
 * Tarkista relaatiojutuissa, että id-columni löytyy ja heitä virhe jos ei.
 *
 * Multi-insert:
 *  Laske id:t JOSS tietokanta takaa että ne on perättäisiä ja JOSS id:tä ei palauteta jos primary key ei oo incremental
 *
 * Tarkista että MoronRelation.relate metodi käyttää joka paikassa relatedProp -propertyä eikä id:tä
 */

/**
 * @extends MoronModelBase
 * @constructor
 */
function MoronModel() {
  MoronModelBase.apply(this, arguments);
}

MoronModelBase.makeSubclass(MoronModel);

MoronModel.prototype.$id = function () {
  var ModelClass = this.constructor;

  if (arguments.length > 0) {
    this[ModelClass.getIdProperty()] = arguments[0];
  } else {
    return this[ModelClass.getIdProperty()];
  }
};

MoronModel.prototype.$query = function (transaction) {
  var ModelClass = this.constructor;
  var self = this;

  return MoronQueryBuilder
    .forClass(ModelClass)
    .transacting(transaction || ModelClass.transaction)
    .findImpl(function () {
      this.where(ModelClass.getFullIdColumn(), self.$id());
    })
    .insertImpl(function () {
      ModelClass.$$insert(this, self);
    })
    .updateImpl(function (update) {
      ModelClass.$$update(this, update || self).where(ModelClass.getFullIdColumn(), self.$id());
    })
    .patchImpl(function (patch) {
      ModelClass.$$patch(this, patch || self).where(ModelClass.getFullIdColumn(), self.$id());
    })
    .deleteImpl(function () {
      ModelClass.$$delete(this).where(ModelClass.getFullIdColumn(), self.$id());
    })
    .relateImpl(function () {
      throw new Error('relate makes no sense in this context');
    })
    .unrelateImpl(function () {
      throw new Error('relate makes no sense in this context');
    });
};

MoronModel.prototype.$relatedQuery = function (relationName, transaction) {
  var relation = this.constructor.getRelation(relationName);
  var ModelClass = relation.relatedModelClass;
  var self = this;

  return MoronQueryBuilder
    .forClass(ModelClass)
    .transacting(transaction || ModelClass.transaction)
    .findImpl(function () {
      relation.find(this, self);
    })
    .insertImpl(function (modelsToInsert) {
      relation.insert(this, self, modelsToInsert);
    })
    .updateImpl(function (update) {
      relation.update(this, self, update);
    })
    .patchImpl(function (patch) {
      relation.patch(this, self, patch);
    })
    .deleteImpl(function () {
      relation.delete(this, self);
    })
    .relateImpl(function (ids) {
      relation.relate(this, self, ids);
    })
    .unrelateImpl(function () {
      relation.unrelate(this, self);
    });
};

MoronModel.prototype.$loadRelated = function (eagerExpression, transaction) {
  return this.constructor.loadRelated(this, eagerExpression, transaction);
};

/**
 * @override
 */
MoronModel.prototype.$parseDatabaseJson = function (json) {
  var ModelClass = this.constructor;
  var jsonAttr = ModelClass.getJsonAttributes();

  if (jsonAttr.length) {
    for (var i = 0, l = jsonAttr.length; i < l; ++i) {
      var attr = jsonAttr[i];
      var value = json[attr];

      if (_.isString(value)) {
        json[attr] = JSON.parse(value);
      }
    }
  }

  return json;
};

/**
 * @override
 */
MoronModel.prototype.$formatDatabaseJson = function (json) {
  var ModelClass = this.constructor;
  var jsonAttr = ModelClass.getJsonAttributes();

  if (jsonAttr.length) {
    for (var i = 0, l = jsonAttr.length; i < l; ++i) {
      var attr = jsonAttr[i];
      var value = json[attr];

      if (_.isObject(value)) {
        json[attr] = JSON.stringify(value);
      }
    }
  }

  return ModelClass.$$omitNonColumns(json);
};

/**
 * @override
 */
MoronModel.prototype.$setJson = function (json, options) {
  MoronModelBase.prototype.$setJson.call(this, json, options);

  var relations = this.constructor.getRelations();
  if (!relations.length || !_.isObject(json)) {
    return;
  }

  // Parse relations into MoronModel instances.
  for (var relationName in relations) {
    if (relations.hasOwnProperty(relationName) && json.hasOwnProperty(relationName)) {
      var relationJson = json[relationName];
      var relation = relations[relationName];

      if (_.isArray(relationJson)) {
        var arr = new Array(relationJson.length);

        for (var i = 0, l = relationJson.length; i < l; ++i) {
          arr[i] = relation.relatedModelClass.fromJson(relationJson[i]);
        }

        this[relationName] = arr;
      } else if (relationJson) {
        this[relationName] = relation.relatedModelClass.fromJson(relationJson);
      } else {
        this[relationName] = null;
      }
    }
  }
};

/**
 * @override
 *
 * @param {Boolean} shallow
 *    If true the relations are omitted from the json.
 */
MoronModel.prototype.$toJson = function (shallow) {
  var json = MoronModelBase.prototype.$toJson.call(this);

  if (shallow) {
    return this.constructor.$$omitRelations(json);
  } else {
    return json;
  }
};

MoronModel.HasOneRelation = MoronHasOneRelation;
MoronModel.HasManyRelation = MoronHasManyRelation;
MoronModel.ManyToManyRelation = MoronManyToManyRelation;

MoronModel.knex = null;
MoronModel.tableName = null;
MoronModel.idColumn = 'id';
MoronModel.transaction = null;

MoronModel.jsonAttributes = null;
MoronModel.relationMappings = null;

MoronModel.$$idProperty = null;
MoronModel.$$relations = null;
MoronModel.$$pickAttributes = null;
MoronModel.$$omitAttributes = null;

MoronModel.query = function (transaction) {
  var ModelClass = this;

  return MoronQueryBuilder
    .forClass(ModelClass)
    .transacting(transaction || ModelClass.transaction)
    .insertImpl(function (models) {
      ModelClass.$$insert(this, models);
    })
    .updateImpl(function (update) {
      ModelClass.$$update(this, update);
    })
    .patchImpl(function (patch) {
      ModelClass.$$patch(this, patch);
    })
    .deleteImpl(function () {
      ModelClass.$$delete(this);
    })
    .relateImpl(function () {
      throw new Error('relate makes no sense in this context');
    })
    .unrelateImpl(function () {
      throw new Error('relate makes no sense in this context');
    });
};

MoronModel.ensureModel = function (model, options) {
  var ModelClass = this;

  if (!model) {
    return null;
  }

  if (model instanceof ModelClass) {
    return model;
  } else if (model instanceof MoronModel) {
    throw new Error('model is already an instance of another MoronModel');
  } else {
    return ModelClass.fromJson(model, options);
  }
};

MoronModel.ensureModelArray = function (models, options) {
  var ModelClass = this;

  if (!models) {
    return null;
  }

  return _.map(ensureArray(models), function (model) {
    return ModelClass.ensureModel(model, options);
  });
};

MoronModel.getIdProperty = function () {
  if (!this.$$idProperty) {
    this.$$idProperty = this.columnNameToPropertyName(this.idColumn);

    if (!this.$$idProperty) {
      throw new Error(this.name +
        '.$parseDatabaseJson probably changes the value of the id column `' + this.idColumn +
        '` which is a no-no.');
    }
  }

  return this.$$idProperty;
};

MoronModel.getFullIdColumn = function () {
  return this.tableName + '.' + this.idColumn;
};

/**
 * @return {Object.<String, MoronRelation>}
 */
MoronModel.getRelations = function () {
  var ModelClass = this;

  if (!this.$$relations) {
    // Lazy-load the relations to prevent require loops.
    this.$$relations = _.reduce(this.relationMappings, function (relations, mapping, relationName) {
      relations[relationName] = new mapping.relation(relationName, ModelClass);
      relations[relationName].setMapping(mapping);
      return relations;
    }, Object.create(null));
  }

  return this.$$relations;
};

/**
 * @return {MoronRelation}
 */
MoronModel.getRelation = function (name) {
  var relation = this.getRelations()[name];

  if (!relation) {
    throw new Error("model class '" + this.name + "' doesn't have relation '" + name + "'");
  }

  return relation;
};

MoronModel.getJsonAttributes = function () {
  var self = this;

  // If the jsonAttributes property is not set, try to create it based
  // on the jsonSchema. All properties that are objects or arrays must
  // be converted to JSON.
  if (!this.jsonAttributes && this.jsonSchema) {
    this.jsonAttributes = [];

    _.each(this.jsonSchema.properties, function (prop, propName) {
      var types = _.compact(ensureArray(prop.type));

      if (types.length === 0 && _.isArray(prop.anyOf)) {
        types = _.flattenDeep(_.pluck(prop.anyOf, 'type'));
      }

      if (types.length === 0 && _.isArray(prop.oneOf)) {
        types = _.flattenDeep(_.pluck(prop.oneOf, 'type'));
      }

      if (_.contains(types, 'object') || _.contains(types, 'array')) {
        self.jsonAttributes.push(propName);
      }
    });
  }

  if (!_.isArray(this.jsonAttributes)) {
    this.jsonAttributes = [];
  }

  return this.jsonAttributes;
};

MoronModel.bindKnex = function (knex) {

};

MoronModel.bindTransaction = function (transaction) {

};

MoronModel.knexQuery = function (transaction) {
  return this.knex.table(this.tableName).transacting(transaction || this.transaction);
};

MoronModel.generateId = function () {
  return null;
};

MoronModel.loadRelated = function ($models, expression, transaction) {
  transaction = transaction || this.transaction;

  if (!(expression instanceof MoronRelationExpression)) {
    expression = MoronRelationExpression.parse(expression);
  }

  if (!expression) {
    throw new Error('invalid expression ' + expression);
  }

  return new MoronEagerFetcher({
    transaction: transaction,
    modelClass: this,
    models: this.ensureModelArray($models),
    eager: expression
  }).fetch().then(function (models) {
    return _.isArray($models) ? models : models[0];
  });
};

MoronModel.$$insert = function (builder, $models) {
  var ModelClass = this;
  var models = ModelClass.ensureModelArray($models);

  var json = _.map(models, function (model) {
    var id = ModelClass.generateId();

    if (!_.isNull(id)) {
      model.$id(id);
    }

    return model.$toDatabaseJson();
  });

  return builder.insert(json).returning(ModelClass.getFullIdColumn()).runAfterModelCreatePushFront(function (ids) {
    // TODO
    if (ids.length === 1 && models.length > 1) {
      var lastId = ids[0];
      ids = [];
      for (var i = models.length - 1; i >= 0; --i) {
        ids.unshift(lastId--);
      }
    }

    _.each(models, function (model, idx) {
      model.$id(ids[idx]);
    });

    if (_.isArray($models)) {
      return models;
    } else {
      return models[0];
    }
  });
};

MoronModel.$$update = function (builder, $update) {
  if (!$update) {
    return builder;
  }

  var ModelClass = this;
  $update = ModelClass.ensureModel($update);

  var update = $update.$clone();
  delete update[ModelClass.getIdProperty()];

  return builder.update(update.$toDatabaseJson()).runAfterModelCreatePushFront(function () {
    return $update;
  });
};

MoronModel.$$patch = function (builder, $patch) {
  if (!$patch) {
    return builder;
  }

  var ModelClass = this;
  $patch = ModelClass.ensureModel($patch, {patch: true});

  var patch = $patch.$clone();
  delete patch[ModelClass.getIdProperty()];

  return builder.update(patch.$toDatabaseJson()).runAfterModelCreatePushFront(function () {
    return $patch;
  });
};

MoronModel.$$delete = function (builder) {
  return builder.delete().runAfterModelCreatePushFront(function () {
    return {};
  });
};

MoronModel.$$omitNonColumns = function (json) {
  if (this.jsonSchema) {
    if (!this.$$pickAttributes) {
      this.$$pickAttributes = _.keys(this.jsonSchema.properties);
    }

    // If jsonSchema is defined, only pick the attributes listed in the
    // jsonSchema.properties object.
    return _.pick(json, this.$$pickAttributes);
  } else {
    // If jsonSchema is not defined, pick all attributes but the relations.
    return this.$$omitRelations(json);
  }
};

MoronModel.$$omitRelations = function (json) {
  if (!this.$$omitAttributes) {
    this.$$omitAttributes = _.keys(this.getRelations());
  }
  
  if (this.$$omitAttributes.length) {
    return _.omit(json, this.$$omitAttributes);
  }
  
  return json;
};

function ensureArray(obj) {
  if (_.isArray(obj)) {
    return obj;
  } else {
    return [obj];
  }
}

module.exports = MoronModel;
