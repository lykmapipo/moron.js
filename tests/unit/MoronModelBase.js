var _ = require('lodash')
  , expect = require('expect.js')
  , MoronModelBase = require('../../lib/MoronModelBase')
  , MoronValidationError = require('../../lib/MoronValidationError');

describe('MoronModelBase', function () {

  describe('makeSubclass', function () {

    it('should create a subclass', function () {
      function Model() {
        MoronModelBase.apply(this, arguments);
      }

      MoronModelBase.makeSubclass(Model);

      var model = new Model();

      expect(model).to.be.a(Model);
      expect(model).to.be.a(MoronModelBase);
    });

    it('should create a subclass of subclass', function () {
      function Model() {
        MoronModelBase.apply(this, arguments);
      }
      function Model2() {
        Model.apply(this, arguments);
      }

      MoronModelBase.makeSubclass(Model).makeSubclass(Model2);

      var model = new Model2();

      expect(model).to.be.a(Model2);
      expect(model).to.be.a(Model);
      expect(model).to.be.a(MoronModelBase);
    });

    it('should fail if the subclass constructor has no name', function () {
      var Model = function () {
        MoronModelBase.apply(this, arguments);
      };

      expect(function () {
        MoronModelBase.makeSubclass(Model);
      }).to.throwException();
    });

  });

  describe('fromJson', function () {
    var Model;

    beforeEach(function () {
      Model = createModelClass();
    });

    it('should copy attributes to the created object', function () {
      var json = {a: 1, b: 2, c: {d: 'str1'}, e: [3, 4, {f: 'str2'}]};
      var model = Model.fromJson(json);

      expect(model.a).to.equal(1);
      expect(model.b).to.equal(2);
      expect(model.c.d).to.equal('str1');
      expect(model.e[0]).to.equal(3);
      expect(model.e[1]).to.equal(4);
      expect(model.e[2].f).to.equal('str2');
    });

    it('should skip properties starting with $', function () {
      var model = Model.fromJson({a: 1, $b: 2});

      expect(model.a).to.equal(1);
      expect(model).not.to.have.property('$b');
    });

    it('should skip functions', function () {
      var model = Model.fromJson({a: 1, b: function () {}});

      expect(model.a).to.equal(1);
      expect(model).not.to.have.property('b');
    });

    it('should call $parseJson', function () {
      var calls = 0;
      var json = {a: 1};
      var options = {b: 2};

      Model.prototype.$parseJson = function (jsn, opt) {
        ++calls;
        expect(jsn).to.eql(json);
        expect(opt).to.eql(options);
        return {c: 3};
      };

      var model = Model.fromJson(json, options);

      expect(model).not.to.have.property('a');
      expect(model.c).to.equal(3);
      expect(calls).to.equal(1);
    });

    it('should validate if jsonSchema is defined', function () {
      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string'},
          b: {type: 'number'}
        }
      };

      expect(function () {
        Model.fromJson({a: 'str', b: 1});
      }).not.to.throwException();

      // b is not required.
      expect(function () {
        Model.fromJson({a: 'str'});
      }).not.to.throwException();

      expect(function () {
        Model.fromJson({a: 1, b: '1'});
      }).to.throwException(function (exp) {
        expect(exp).to.be.a(MoronValidationError);
        expect(exp.data).to.have.property('a');
        expect(exp.data).to.have.property('b');
      });

      expect(function () {
        Model.fromJson({b: 1});
      }).to.throwException(function (exp) {
        expect(exp).to.be.a(MoronValidationError);
        expect(exp.data).to.have.property('a');
      });

    });

    it('should call $validate if jsonSchema is defined', function () {
      var calls = 0;
      var json = {a: 'str', b: 2};
      var options = {some: 'option'};

      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string'},
          b: {type: 'number'}
        }
      };

      Model.prototype.$validate = function (jsn, opt) {
        MoronModelBase.prototype.$validate.call(this, jsn, opt);

        ++calls;
        expect(opt).to.eql(options);
        expect(jsn).to.eql(json);
      };

      expect(function () {
        Model.fromJson(json, options);
      }).not.to.throwException();

      expect(calls).to.equal(1);
    });

    it('should call $beforeValidate if jsonSchema is defined', function () {
      var calls = 0;
      var json = {a: 1, b: 2};
      var options = {some: 'option'};

      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string'},
          b: {type: 'number'}
        }
      };

      Model.prototype.$beforeValidate = function (schema, jsn, opt) {
        ++calls;

        expect(opt).to.eql(options);
        expect(jsn).to.eql(json);
        expect(schema).to.eql(Model.jsonSchema);

        schema.properties.a.type = 'number';
        return schema;
      };

      expect(function () {
        Model.fromJson(json, options);
      }).not.to.throwException();

      expect(calls).to.equal(1);
    });

    it('should call $afterValidate if jsonSchema is defined', function () {
      var calls = 0;
      var json = {a: 'str', b: 2};
      var options = {some: 'option'};

      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string'},
          b: {type: 'number'}
        }
      };

      Model.prototype.$afterValidate = function (jsn, opt) {
        ++calls;
        expect(opt).to.eql(options);
        expect(jsn).to.eql(json);
      };

      expect(function () {
        Model.fromJson(json, options);
      }).not.to.throwException();

      expect(calls).to.equal(1);
    });

    it('should skip requirement validation if options.patch == true', function () {
      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string'},
          b: {type: 'number'}
        }
      };

      expect(function () {
        Model.fromJson({a: 'str', b: 1}, {patch: true});
      }).not.to.throwException();

      // b is not required.
      expect(function () {
        Model.fromJson({a: 'str'}, {patch: true});
      }).not.to.throwException();

      expect(function () {
        Model.fromJson({a: 1, b: '1'}, {patch: true});
      }).to.throwException(function (exp) {
        expect(exp).to.be.a(MoronValidationError);
        expect(exp.data).to.have.property('a');
        expect(exp.data).to.have.property('b');
      });

      expect(function () {
        Model.fromJson({b: 1}, {patch: true});
      }).not.to.throwException();

    });

    it('should merge default values from jsonSchema', function () {
      var obj = {a: 100, b: 200};

      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string', default: 'default string'},
          b: {type: 'number', default: 666},
          c: {type: 'object', default: obj}
        }
      };

      var model = Model.fromJson({a: 'str'});

      expect(model.a).to.equal('str');
      expect(model.b).to.equal(666);
      expect(model.c).to.eql(obj);
      expect(model.c).not.to.equal(obj);
    });

    it('should not merge default values from jsonSchema if options.patch == true', function () {
      var obj = {a: 100, b: 200};

      Model.jsonSchema = {
        required: ['a'],
        properties: {
          a: {type: 'string', default: 'default string'},
          b: {type: 'number', default: 666},
          c: {type: 'object', default: obj}
        }
      };

      var model = Model.fromJson({b: 10}, {patch: true});

      expect(model).to.not.have.property('a');
      expect(model.b).to.equal(10);
      expect(model).to.not.have.property('c');
    });

  });

  describe('fromDatabaseJson', function () {
    var Model;

    beforeEach(function () {
      Model = createModelClass();
    });

    it('should copy attributes to the created object', function () {
      var json = {a: 1, b: 2, c: {d: 'str1'}, e: [3, 4, {f: 'str2'}]};
      var model = Model.fromDatabaseJson(json);

      expect(model.a).to.equal(1);
      expect(model.b).to.equal(2);
      expect(model.c.d).to.equal('str1');
      expect(model.e[0]).to.equal(3);
      expect(model.e[1]).to.equal(4);
      expect(model.e[2].f).to.equal('str2');
    });

    it('should skip properties starting with $', function () {
      var model = Model.fromDatabaseJson({a: 1, $b: 2});

      expect(model.a).to.equal(1);
      expect(model).not.to.have.property('$b');
    });

    it('should skip functions', function () {
      var model = Model.fromDatabaseJson({a: 1, b: function () {}});

      expect(model.a).to.equal(1);
      expect(model).not.to.have.property('b');
    });

    it('should call $parseDatabaseJson', function () {
      var calls = 0;
      var json = {a: 1};

      Model.prototype.$parseDatabaseJson = function (jsn) {
        ++calls;
        expect(jsn).to.eql(json);
        return {c: 3};
      };

      var model = Model.fromDatabaseJson(json);

      expect(model).not.to.have.property('a');
      expect(model.c).to.equal(3);
      expect(calls).to.equal(1);
    });

  });

  describe('$toJson', function () {
    var Model;

    beforeEach(function () {
      Model = createModelClass();
    });

    it('should return then internal representation by default', function () {
      expect(Model.fromJson({a: 1, b: 2, c: {d: [1, 3]}}).$toJson()).to.eql({a: 1, b: 2, c: {d: [1, 3]}});
    });

    it('should call $formatJson', function () {
      var calls = 0;
      var json = {a: 1};

      Model.prototype.$formatJson = function (jsn) {
        ++calls;
        expect(jsn).to.eql(json);
        jsn.b = 2;
        return jsn;
      };

      var model = Model.fromJson(json);
      var output = model.$toJson();

      expect(output.a).to.equal(1);
      expect(output.b).to.equal(2);
      expect(calls).to.equal(1);
    });

    it('should call $toJson for properties of class MoronModelBase', function () {
      var Model2 = createModelClass();

      Model2.prototype.$formatJson = function (jsn) {
        jsn.d = 3;
        return jsn;
      };

      var model = Model.fromJson({a: 1});
      model.b = Model2.fromJson({c: 2});
      model.e = [Model2.fromJson({f: 100})];

      expect(model.$toJson()).to.eql({a: 1, b: {c: 2, d: 3}, e: [{f:100, d:3}]});
    });

    it('should return a deep copy', function () {
      var json = {a: 1, b: [{c:2}], d: {e: 'str'}};
      var model = Model.fromJson(json);
      var output = model.$toJson();

      expect(output).to.eql(json);
      expect(output.b).to.not.equal(json.b);
      expect(output.b[0]).to.not.equal(json.b[0]);
      expect(output.d).to.not.equal(json.d);
    });

    it('should be called by JSON.stringify', function () {
      Model.prototype.$formatJson = function (jsn) {
        jsn.b = 2;
        return jsn;
      };

      var model = Model.fromJson({a: 1});
      expect(JSON.stringify(model)).to.equal('{"a":1,"b":2}');
    });

  });

  describe('$toDatabaseJson', function () {
    var Model;

    beforeEach(function () {
      Model = createModelClass();
    });

    it('should return then internal representation by default', function () {
      expect(Model.fromJson({a: 1, b: 2, c: {d: [1, 3]}}).$toDatabaseJson()).to.eql({a: 1, b: 2, c: {d: [1, 3]}});
    });

    it('should call $formatDatabaseJson', function () {
      var calls = 0;
      var json = {a: 1};

      Model.prototype.$formatDatabaseJson = function (jsn) {
        ++calls;
        expect(jsn).to.eql(json);
        jsn.b = 2;
        return jsn;
      };

      var model = Model.fromJson(json);
      var output = model.$toDatabaseJson();

      expect(output.a).to.equal(1);
      expect(output.b).to.equal(2);
      expect(calls).to.equal(1);
    });

    it('should call $toDatabaseJson for properties of class MoronModelBase', function () {
      var Model2 = createModelClass();

      Model2.prototype.$formatDatabaseJson = function (jsn) {
        jsn.d = 3;
        return jsn;
      };

      var model = Model.fromJson({a: 1});
      model.b = Model2.fromJson({c: 2});
      model.e = [Model2.fromJson({f: 100})];

      expect(model.$toDatabaseJson()).to.eql({a: 1, b: {c: 2, d: 3}, e: [{f:100, d:3}]});
    });

    it('should return a deep copy', function () {
      var json = {a: 1, b: [{c:2}], d: {e: 'str'}};
      var model = Model.fromJson(json);
      var output = model.$toDatabaseJson();

      expect(output).to.eql(json);
      expect(output.b).to.not.equal(json.b);
      expect(output.b[0]).to.not.equal(json.b[0]);
      expect(output.d).to.not.equal(json.d);
    });

  });

  describe('$clone', function () {
    var Model;

    beforeEach(function () {
      Model = createModelClass();
    });

    it('should clone', function () {
      var Model2 = createModelClass();

      Model2.prototype.$formatJson = function (jsn) {
        jsn.d = 3;
        return jsn;
      };

      var model = Model.fromJson({a: 1, g: {h: 100}});
      model.b = Model2.fromJson({c: 2});
      model.e = [Model2.fromJson({f: 100})];

      var clone = model.$clone();

      expect(clone).to.eql(model);
      expect(clone.$toJson()).to.eql(model.$toJson());
      expect(clone.$toJson()).to.eql({a: 1, g: {h: 100}, b: {c: 2, d: 3}, e: [{f: 100, d: 3}]});

      expect(clone.g).to.not.equal(model.g);
      expect(clone.b).to.not.equal(model.b);
      expect(clone.e[0]).to.not.equal(model.e[0]);
    });
  });

  function createModelClass(proto, staticStuff) {
    function Model() {
      MoronModelBase.apply(this, arguments);
    }

    MoronModelBase.makeSubclass(Model);

    _.merge(Model.prototype, proto);
    _.merge(Model, staticStuff);

    return Model;
  }

});
