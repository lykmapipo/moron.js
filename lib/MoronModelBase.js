"use strict";

var _ = require('lodash')
  , tv4 = require('tv4')
  , uuid = require('node-uuid')
  , tv4Formats = require('tv4-formats')
  , utils = require('./utils')
  , MoronValidationError = require('./MoronValidationError');

// Add validation formats, so that for example the following schema validation works:
// createTime: {type: 'string', format: 'date-time'}
tv4.addFormat(tv4Formats);

/**
 * @typedef {Object} MoronModelOptions
 *
 * @property {Boolean} patch
 *    If true the json is treated as a patch.
 */

/**
 * Base class for models.
 *
 * `MoronModelBase` provides a mechanism for automatic JSON validation and a way to attach
 * functionality to plain javascript objects.
 *
 * Use `MoronModelBase.from*Json` methods to create models from JSON objects. The `MoronModelBase.from*Json`
 * methods copy the json properties to the created model:
 *
 * ```js
 * var model = MoronModelBase.fromJson({foo: 'bar', id: 10});
 * console.log(model.foo); // --> bar
 * console.log(model.id); // --> 10
 * ```
 *
 * Properties that are prefixed with '$' are excluded from all JSON representations.
 *
 * ```js
 * var model = MoronModelBase.fromJson({foo: 'bar', id: 10});
 * model.$spam = 100;
 * console.log(model); // --> {foo: 'bar', id: 10, $spam: 100}
 * console.log(model.$toJson()); // --> {foo: 'bar', id: 10}
 * ```
 *
 * Set the static property `jsonSchema` to enable validation. Validation is performed when models
 * are created using the `fromJson` method or when the model is updated using the `$setJson`
 * method.
 *
 * @constructor
 */
function MoronModelBase() {
  // Nothing to do here.
}

/**
 * This is called before validation.
 *
 * Here you can dynamically edit the jsonSchema if needed.
 *
 * @param {Object} jsonSchema
 *    A deep clone of this class's jsonSchema.
 *
 * @param {Object} json
 *    The JSON object to be validated.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 *
 * @return {Object}
 *    The (possibly) modified jsonSchema.
 */
MoronModelBase.prototype.$beforeValidate = function (jsonSchema, json, options) {
  return jsonSchema;
};

/**
 * Validates the given JSON object.
 *
 * Calls `$beforeValidation` and `$afterValidation` methods. This method is called
 * automatically from `fromJson` and `$setJson` methods. This method can also be
 * called explicitly when needed.
 *
 * @throws MoronValidationError
 *    If validation fails.
 *
 * @param {Object=} json
 *    If not given ==> this.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 *
 * @return {Object}
 *    The input json
 */
MoronModelBase.prototype.$validate = function (json, options) {
  var ModelClass = this.constructor;
  var jsonSchema = ModelClass.jsonSchema;
  var required;

  options = options || {};
  json = json || this;

  if (!jsonSchema) {
    return json;
  }

  // No need to call $beforeValidate (and clone the jsonSchema) if $beforeValidate has not been overwritten.
  if (this.$beforeValidate !== MoronModelBase.prototype.$beforeValidate) {
    jsonSchema = ModelClass.deepCloneJson(jsonSchema);
    jsonSchema = this.$beforeValidate(jsonSchema, json, options);
  }

  if (options.patch) {
    required = jsonSchema.required;
    jsonSchema.required = [];
  }

  var report = tv4.validateMultiple(json, jsonSchema);

  if (options.patch) {
    jsonSchema.required = required;
  }

  var validationError = this.$$parseValidationError(report);

  if (validationError) {
    throw validationError;
  }

  this.$afterValidate(json, options);
  return json;
};

/**
 * This is called after successful validation.
 *
 * You can do further validation here and throw a MoronValidationError if something goes wrong.
 *
 * @param {Object=} json
 *    The JSON object to validate.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 */
MoronModelBase.prototype.$afterValidate = function (json, options) {
  // Do nothing by default.
};

/**
 * This is called when a `MoronModelBase` is created from a database JSON object.
 *
 * Converts the JSON object from the database format to the internal format.
 *
 * @note This function must handle the case where any subset of the columns comes
 *    in the `json` argument. You cannot assume that all columns are present as it
 *    depends on the select statement. There can also be additional columns because
 *    of join clauses, aliases etc.
 *
 * @note If you override this remember to call the super class's implementation.
 *
 * @param {Object} json
 *    The JSON object in database format.
 *
 * @return {Object}
 *    The JSON object in internal format.
 */
MoronModelBase.prototype.$parseDatabaseJson = function (json) {
  return json;
};

/**
 * This is called when a `MoronModelBase` is converted to database format.
 *
 * Converts the JSON object from the internal format to the database format.
 *
 * @note If you override this remember to call the super class's implementation.
 *
 * @param {Object} json
 *    The JSON object in internal format.
 *
 * @return {Object}
 *    The JSON object in database format.
 */
MoronModelBase.prototype.$formatDatabaseJson = function (json) {
  return json;
};

/**
 * This is called when a `MoronModelBase` is created from a JSON object.
 *
 * Converts the JSON object to the internal format.
 *
 * @note If you override this remember to call the super class's implementation.
 *
 * @param {Object} json
 *    The JSON object in external format.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 *
 * @return {Object}
 *    The JSON object in internal format.
 */
MoronModelBase.prototype.$parseJson = function (json, options) {
  return json;
};

/**
 * This is called when a `MoronModelBase` is converted to JSON.
 *
 * @note Remember to call the super class's implementation.
 *
 * @param {Object} json
 *    The JSON object in internal format
 *
 * @return {Object}
 *    The JSON object in external format.
 */
MoronModelBase.prototype.$formatJson = function (json) {
  return json;
};

/**
 * Exports this model as a database JSON object.
 *
 * Calls `$formatDatabaseJson()`.
 *
 * @return {Object}
 *    This model as a JSON object in database format.
 */
MoronModelBase.prototype.$toDatabaseJson = function () {
  return this.$$toJson(true);
};

/**
 * Exports this model as a JSON object.
 *
 * Calls `$formatJson()`.
 *
 * @return {Object}
 *    This model as a JSON object.
 */
MoronModelBase.prototype.$toJson = function () {
  return this.$$toJson(false);
};

/**
 * Alias for `this.$toJson()`.
 *
 * For JSON.stringify compatibility.
 */
MoronModelBase.prototype.toJSON = function () {
  return this.$toJson();
};

/**
 * Sets the values from a JSON object.
 *
 * Validates the JSON before setting values. Calls `this.$parseJson()`.
 *
 * @param {Object} json
 *    The JSON object to set.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 *
 * @throws MoronValidationError
 *    If validation fails.
 */
MoronModelBase.prototype.$setJson = function (json, options) {
  json = json || {};
  options = options || {};
  var ModelClass = this.constructor;

  if (!options.patch) {
    json = ModelClass.$$mergeWithDefaults(json);
  }

  json = this.$parseJson(json, options);
  json = this.$validate(json, options);

  for (var key in json) {
    if (ModelClass.hasOwnJsonProperty(json, key)) {
      this[key] = json[key];
    }
  }
};

/**
 * Sets the values from a JSON object in database format.
 *
 * Calls `this.$parseDatabaseJson()`.
 *
 * @param {Object} json
 *    The JSON object in database format.
 */
MoronModelBase.prototype.$setDatabaseJson = function (json) {
  json = this.$parseDatabaseJson(json || {});
  var ModelClass = this.constructor;

  for (var key in json) {
    if (ModelClass.hasOwnJsonProperty(json, key)) {
      this[key] = json[key];
    }
  }
};

/**
 * The schema against which the JSON is validated.
 *
 * The jsonSchema can be dynamically modified in the `$beforeValidate` method.
 *
 * Must follow http://json-schema.org specification. If null no validation is done.
 *
 * @see $beforeValidate()
 * @see $validate()
 * @see $afterValidate()
 * @type {Object}
 */
MoronModelBase.jsonSchema = null;

/**
 * Makes the given constructor a subclass of this class.
 *
 * @param {function=} subclassConstructor
 * @return {function}
 */
MoronModelBase.makeSubclass = function (subclassConstructor) {
  if (_.isEmpty(subclassConstructor.name)) {
    throw new Error('Each MoronModelBase subclass constructor must have a name');
  }

  utils.inherits(subclassConstructor, this);
  return subclassConstructor;
};

/**
 * Creates a model instance from a JSON object.
 *
 * The object is checked against `jsonSchema` and an exception is thrown on failure.
 *
 * @param {Object=} json
 *    The JSON from which to create the model.
 *
 * @param {MoronModelOptions=} options
 *    Optional options.
 *
 * @throws MoronValidationError
 *    If validation fails.
 */
MoronModelBase.fromJson = function (json, options) {
  var model = new this();
  model.$setJson(json || {}, options);
  return model;
};

/**
 * Creates a model instance from a JSON object in database format.
 *
 * @param {Object=} json
 *    The JSON from which to create the model.
 */
MoronModelBase.fromDatabaseJson = function (json) {
  var model = new this();
  model.$setDatabaseJson(json || {});
  return model;
};

/**
 * Takes a deep clone of a pure JSON object.
 */
MoronModelBase.deepCloneJson = function (json) {
  return _.cloneDeep(json);
};

/**
 * Returns true if object[key] is copyable to the model when converting from JSON to a model.
 *
 * By default the properties that start with '$' are ignored. This behaviour can be changed
 * by overriding this method.
 *
 * @param {Object} object
 * @param {String} key
 */
MoronModelBase.hasOwnJsonProperty = function (object, key) {
  return object.hasOwnProperty(key) && key.charAt(0) !== '$' && !_.isFunction(object[key]);
};

MoronModelBase.columnNameToPropertyName = function (columnName) {
  var row = {};
  var value = uuid.v4();

  row[columnName] = value;

  var model = this.fromDatabaseJson(row);
  var propertyName = _.findKey(model, function (val) {
    return val === value;
  });

  if (!propertyName && _.size(model) === 1) {
    propertyName = _.first(_.keys(model));
  }

  return propertyName || null;
};

/**
 * Returns a deep copy of this model.
 *
 * If this object has instances of `MoronModelBase` as properties (or arrays of them)
 * they are cloned using their `.$clone()` method.
 *
 * @return {MoronModelBase}
 */
MoronModelBase.prototype.$clone = function () {
  var ModelClass = this.constructor;
  var copy = new ModelClass();

  for (var key in this) {
    if (!this.hasOwnProperty(key)) {
      continue;
    }

    var value = this[key];
    if (_.isArray(value)) {
      var arr = [];

      for (var i = 0, l = value.length; i < l; ++i) {
        if (value[i] instanceof MoronModelBase) {
          arr.push(value[i].$clone());
        } else {
          arr.push(ModelClass.deepCloneJson(value[i]));
        }
      }

      copy[key] = arr;
    } else if (_.isObject(value)) {
      if (value instanceof MoronModelBase) {
        copy[key] = value.$clone();
      } else {
        copy[key] = ModelClass.deepCloneJson(value);
      }
    } else {
      copy[key] = value;
    }
  }

  return copy;
};

/**
 * @private
 */
MoronModelBase.prototype.$$toJson = function (createDbJson) {
  var ModelClass = this.constructor;
  var json = {};

  for (var key in this) {
    if (!ModelClass.hasOwnJsonProperty(this, key)) {
      continue;
    }

    var value = this[key];
    if (_.isArray(value)) {
      var arr = [];

      for (var i = 0, l = value.length; i < l; ++i) {
        if (value[i] instanceof MoronModelBase) {
          arr.push(value[i].$$toJson(createDbJson));
        } else {
          arr.push(ModelClass.deepCloneJson(value[i]));
        }
      }

      json[key] = arr;
    } else if (_.isObject(value)) {
      if (value instanceof MoronModelBase) {
        json[key] = value.$$toJson(createDbJson);
      } else {
        json[key] = ModelClass.deepCloneJson(value);
      }
    } else {
      json[key] = value;
    }
  }

  if (createDbJson) {
    return this.$formatDatabaseJson(json);
  } else {
    return this.$formatJson(json);
  }
};

/**
 * @private
 */
MoronModelBase.$$mergeWithDefaults = function (json) {
  var jsonSchema = this.jsonSchema;
  var merged = null;

  if (!jsonSchema) {
    return json;
  }

  var props = jsonSchema.properties;
  // Check each schema property for default value.
  for (var key in props) {
    if (props.hasOwnProperty(key) && !_.has(json, key)) {
      var prop = props[key];

      if (_.has(prop, 'default')) {
        if (merged === null) {
          // Only take expensive clone if needed.
          merged = this.deepCloneJson(json);
        }

        if (_.isObject(prop.default)) {
          merged[key] = this.deepCloneJson(prop.default);
        } else {
          merged[key] = prop.default;
        }
      }
    }
  }

  if (merged === null) {
    return json;
  } else {
    return merged;
  }
};

/**
 * @private
 */
MoronModelBase.prototype.$$parseValidationError = function (report) {
  var errorHash = {};
  var index = 0;

  if (report.errors.length === 0) {
    return null;
  }

  for (var i = 0; i < report.errors.length; ++i) {
    var error = report.errors[i];
    var key = error.dataPath.split('/').slice(1).join('.');

    // Hack: The dataPath is empty for failed 'required' validations. We parse
    // the property name from the error message.
    if (!key && error.message.substring(0, 26) === 'Missing required property:') {
      key = error.message.split(':')[1].trim();
    }

    // If the validation failed because of extra properties, the key is an empty string. We
    // still want a unique error in the hash for each failure.
    if (!key) {
      key = (index++).toString();
    }

    errorHash[key] = error.message;
  }

  return new MoronValidationError(errorHash);
};

module.exports = MoronModelBase;
