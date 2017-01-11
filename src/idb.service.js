"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var core_1 = require('@angular/core');
/* stupid cast operation */
function cast(param) {
    return param;
}
var noop = function () { };
/**
 * @description The qualifier used by Angular's injector. Client code must
 * provide the implementation of {@code IDBServiceConfig}.
 */
exports.IDB_DI_CONFIG = new core_1.OpaqueToken("com.github.kbngmoses.kmdIndexedDB");
var IDBService = (function () {
    function IDBService(idbServiceConfig) {
        this.idbServiceConfig = idbServiceConfig;
        this.database = idbServiceConfig.database;
        this.version = idbServiceConfig.version;
        this.onupgradeneeded = idbServiceConfig.onUpgradeNeeded;
        this.onblocked = idbServiceConfig.onBlocked === undefined ?
            noop : idbServiceConfig.onBlocked;
        idbServiceConfig.onVersionChange = idbServiceConfig.onVersionChange === undefined ?
            function (db) { return true; } : idbServiceConfig.onVersionChange;
    }
    /* throws TypeError when the value of version is zero or a negative number or not a number. */
    IDBService.prototype._init_ = function () {
        var _this = this;
        var indexedDB = window.indexedDB;
        if (!indexedDB) {
            return Promise.reject(new Error('Browser kit does not support indexedDB'));
        }
        // the first parameter of IDBFactory.open() is the name of the database
        // the second parameter is the version of the database. The version of the
        // database determines the schema. The object stores in the database and their
        // structures.
        //
        // if the database doesn't already exist, the open method will create one for you.
        // then the onupgrateneeded event is triggered, allowing you to specify an updated
        // schema in its handler. 
        var request;
        // IDBFactory.open() throws TypeError when the version is negative
        try {
            request = indexedDB.open(this.database, this.version);
        }
        catch (e) {
            return Promise.reject("ERROR: " + e);
        }
        /* handle everything else in the promise */
        return new Promise(function (resolve, reject) {
            var attachOnVersionChange = function (db) {
                /*db.onversionchange = (evt) => {
                    console.log('Version Change...');
                };*/
                _this.idbServiceConfig.onVersionChange(db);
                return db;
            };
            /* bind onerror event and reject the promise */
            request.onerror = function (evt) { reject(evt); };
            /* bind onsuccess event and resolve the promise */
            request.onsuccess = function (evt) {
                var db = evt.target.result;
                resolve(db);
            };
            /* bind onpgradeneeded event and execute client callback whenever necessary */
            request.onupgradeneeded = function (evt) {
                var db = evt.currentTarget.result;
                if (_this.idbServiceConfig.onVersionChange(db)) {
                    _this.idbServiceConfig.onUpgradeNeeded(db);
                }
            };
            /* when the database can't be opened because of different versions in application instances */
            request.onblocked = function () {
                _this.onblocked();
            };
        });
    };
    /* all database operations are wrapped in a transaction */
    IDBService.prototype._getTransaction_ = function (stores, mode) {
        if (mode === void 0) { mode = "readonly"; }
        return this._init_().then(function (db) { return db.transaction(stores, mode); });
    };
    /**
     * @description get stored object by using it's key (primary key). Despite the fact that
     * 	you may use the key methods such as IDBKeyRange.bound() to construct the key, only the
     *	first matching object is returned by the method.
     *
     * @param stores {string|Array<string>} a store or a list of stores on which
     *	the transaction will span.
     * @param store {string} name of the store holding the object.
     * @param range {string|number|Date|IDBKeyRange|IDBArrayKey} key, also
     *	the primary key used by the store to identify objects.
     * @param _cast {(any[]) => T} optional casting operator used by the client code
     *	to fine tune the retrieved object.
     * @return {Promise<T>} a promise of result from the database.
     */
    IDBService.prototype.getObjectByKey = function (stores, store, range, _cast) {
        /*
         * if the client didn't supply the cast operator, we will add
         * the default implementation that simply casts the retrieved objects into
         * requested type.
         */
        var fn = _cast || cast;
        /* wrap every operation under a transaction */
        return this._getTransaction_(stores).then(function (trans) {
            /* construct the request. */
            var request = trans.objectStore(store).get(range);
            /* return the promise */
            return new Promise(function (resolve, reject) {
                request.onerror = function (errorEvent) { reject(errorEvent); };
                request.onsuccess = function (evt) {
                    resolve(fn(evt.target.result));
                };
            });
        });
    };
    /**
     * @description get an array of stored objects, optionally using key
     * @param stores {string|Array<string>} an array of `object` `store`s (scope) from when the read operation will span
     * @param store {string} name of the store we need to read from
     * @param params {GetParams} optional parameters supplied to the query
     * @return {Promise<Array<T>>}
     */
    IDBService.prototype.getObjects = function (stores, store, keyRange, reverse, _cast) {
        if (reverse === void 0) { reverse = false; }
        var fn = _cast || cast;
        return this._getTransaction_(stores).then(function (trans) {
            var cursorReq = trans.objectStore(store)
                .openCursor(keyRange === undefined ? undefined : keyRange, reverse ? undefined : "prev");
            var res = [];
            return new Promise(function (resolve, reject) {
                cursorReq.onerror = function (errorEvt) { reject(errorEvt); };
                cursorReq.onsuccess = function (evt) {
                    var cursor = evt.target.result;
                    if (cursor) {
                        res.push(fn(cursor.value));
                        cursor.continue();
                    }
                    else {
                        resolve(res);
                    }
                };
            });
        });
    };
    /**
     * @description get all indexed objects using an index.
     * @param stores {string|string[]} store or name of the store where the operation should span
     * @param store {string} name of the store we'are going to fetch the items
     * @param range {string|number|Date|IDKeyRange|IDBArrayKey} value of the index/indecies
     * @param reverse {boolean} if true, the objects will be fetched in reverse order.
     *	default is false.
     * @param _cast {Function} the casting operation for the items
     * @return {Promise<T[]>} the promise that will resolve with result, of fail should anything goes wrong.
     */
    IDBService.prototype.getObjectsByIndex = function (stores, store, index, range, reverse, _cast) {
        if (reverse === void 0) { reverse = false; }
        var fn = _cast || cast;
        return this._getTransaction_(stores).then(function (trans) {
            var _index_ = trans.objectStore(store).index(index).openCursor(range, reverse ? "prev" : undefined);
            var res = [];
            return new Promise(function (resolve, reject) {
                trans.onerror = function (evt) { console.error(evt); reject(evt); };
                _index_.onsuccess = function (evt) {
                    var cursor = evt.currentTarget.result;
                    if (cursor) {
                        res.push(fn(cursor.value));
                        cursor.continue();
                    }
                    else {
                        resolve(res);
                    }
                };
            });
        });
    };
    /**
     * @description deletes item record(s) from the database.
     * @param stores {string|Array<string>} the store object(s) of which our search operation will span.
     * @param store {string} name of the object store we need to particulary search from
     * @param keyRage {IDBKeyRange} the key constraint of the object in the store we need to delete.
     * @return {Promise<any>} a promise that may enventually resolve or fail upon completion.
     */
    IDBService.prototype.removeObjectsByKey = function (stores, store, range) {
        return this._getTransaction_(stores, 'readwrite').then(function (trans) {
            trans.objectStore(store).delete(range);
            return new Promise(function (resolve, reject) {
                trans.onerror = function (errorEvt) {
                    reject(errorEvt);
                };
                trans.oncomplete = function (evt) {
                    resolve();
                };
            });
        });
    };
    /**
     * @description Find and replaces a value in the store.
     * 	If you certainly does not need to replace the object, You should instead
     *	use {@link #updateObjectByIndex}
     * @param store {string} name of the object store we need to particulary search from
     * @param params {PutParams} important parameters needed in order to edit the object
     * @return {Promise<T>} a promise that may eventually resolve with edited `<T>` item record
     *	or fail with an error upon completion.
     */
    IDBService.prototype.replaceObjectByKey = function (store, key, value) {
        if (key === undefined || key === null) {
            return Promise.reject(Error("updateByIndex() needs a key value!"));
        }
        var transPromise = this._getTransaction_(store, "readwrite");
        var retPromise = transPromise.then(function (trans) {
            /* inner promise */
            return new Promise(function (resolve, reject) {
                // wait for the transaction to complete
                trans.oncomplete = function () { resolve(value); };
                trans.onerror = function (evt) { reject(evt.error); };
                // firstly, we're deleting the record from the database
                // because the key is going to be altered as well...
                trans.objectStore(store).delete(key)
                    .onsuccess = function (evt) {
                    trans.objectStore(store)
                        .add(value)
                        .onsuccess = function (evt2) { };
                };
            });
        });
        return retPromise;
    };
    /**
     * @description Updates a property of the stored value.
     *
     * @type T type of the property's value we need to update
     * @type R the value type returned by the operation.
     * @param stores {string} name of the store where the value is stored.
     * @param params {PutParams<T>} options that allows us to target the stored value
     * 	we need to update.
     * @param index {string} the index we're using to match
     *	the values in the store.
     * @param allMatches {boolean} if set to true, all the matching records for the given
     * 	property value will be updated. Default is false.
     * @return {Promise<R[]>} a promise that will enventually be fullfilled with
     * 	the new updated stored values or fail with an error
     */
    IDBService.prototype.updateObjectsByIndex = function (store, index, indexVal, params, allMatches) {
        if (allMatches === void 0) { allMatches = false; }
        // make sure client code hasn't forgotten to pass name and value
        if (params.length === 0) {
            return Promise.reject(Error("updateByIndex() needs at least one PutParams"));
        }
        if ((index === undefined) || (index === null)) {
            return Promise.reject(Error('updateByProperty() needs index of the value!'));
        }
        // create the request
        return this._getTransaction_(store, 'readwrite').then(function (trans) {
            var objectStore = trans.objectStore(store);
            var promiseA = new Promise(function (resolve, reject) {
                var updateOne = function (oldValue) {
                    params.forEach(function (param) {
                        if (!oldValue.hasOwnProperty(param.name)) {
                            var config = {
                                value: param.value,
                                writable: true,
                                enumerable: true,
                                configurable: true
                            };
                            Object.defineProperty(oldValue, param.name, config);
                        }
                        else {
                            oldValue[param.name] = param.value;
                        }
                    });
                    var req = objectStore.put(oldValue);
                    return new Promise(function (f, g) {
                        req.onsuccess = function (evt) {
                            f(oldValue);
                        };
                        req.onerror = function (evt) {
                            g(evt);
                        };
                    });
                };
                // should we update all matches or just one match?
                if (allMatches) {
                    var promises_1 = [];
                    objectStore.index(index).openCursor(indexVal).onsuccess = function (evt) {
                        var cursor = evt.target.result;
                        if (cursor) {
                            // reject immediately when we get an error
                            promises_1.push(updateOne(cursor.value));
                        }
                        else {
                            Promise.all(promises_1).then(function (values) { return resolve(values); });
                        }
                    };
                }
                else {
                    objectStore.index(index).get(indexVal).onsuccess = function (evt) {
                        var value = evt.currentTarget.result;
                        updateOne(value).then(function (newValue) { return resolve(newValue); });
                    };
                }
            });
            var promiseB = new Promise(function (resolve, reject) {
                trans.oncomplete = function (evt) { resolve(); };
            });
            return Promise.all([promiseA, promiseB]).then(function (values) {
                return [values[0]];
            });
        });
    };
    /**
     * @description Create a structured clone of the value and store the value under the store.
     * @param store {string} name of the store
     * @param data {Array<T>} an array of values to store in the database.
     * @return {Array<T>} an array of items to return from the database.
     */
    IDBService.prototype.storeObjects = function (store, data) {
        return this._getTransaction_(store, "readwrite").then(function (trans) {
            var objectStore = trans.objectStore(store);
            var promiseA = new Promise(function (resolve, reject) {
                /*
                 * To determine if the add operation has completed successfully,
                 * listen for the transaction’s complete event in addition to the
                 * IDBObjectStore.add request’s success event, because the transaction
                 * may still fail after the success event fires. In other words,
                 * the success event is only triggered when the transaction has been successfully queued.
                 */
                trans.oncomplete = function (evt) {
                    resolve(data);
                };
                /* error event bubbles up */
                trans.onerror = function (errEvt) {
                    reject(errEvt);
                };
            });
            var promiseB = Promise.all(data.map(function (d) { return objectStore.add(d); })
                .map(function (req) { return new Promise(function (resolve, reject) {
                req.onerror = function (errEvt) { reject(errEvt); };
                req.onsuccess = function (evt) { resolve(); };
            }); }));
            return Promise.all([promiseA, promiseB])
                .then(function (values) { return values[0]; });
        });
    };
    /**
     * @description counts objects in a store.
     *
     * ### Example
     *
     * ```typescript
     * idbService.countObjects(['customers'], 'customers')
     * .then(count => /!* your code *!/)
     * .catch(err => /!* handle error(s) *!/)
     * ```
     *
     * @param {string|string[]} stores - name of the stores where the transaction is spanning.
     * @param {string} store - name of the store to count from.
     * @return {Promise<number>} - a promise that may eventually resolve with the number of objects
     *  in the store, of fail altogether with an `Error`.
     */
    IDBService.prototype.countObjects = function (stores, store) {
        return this._getTransaction_(stores).then(function (trans) {
            return new Promise(function (resolve, reject) {
                trans.onerror = function (evt) { reject(evt); };
                trans.objectStore(store).count().onsuccess = function (evt) {
                    var count = evt.target.result;
                    resolve(count);
                };
            });
        });
    };
    /**
     * @description count objects in a store using their index.
     *
     * ### Example
     *
     * ```typescript
     * idbService.countObjectsByIndex(['customers', 'customers', 'name'])
     *  .then(count => /!* your code... *!/)
     *  .catch(err => /!* handle error(s) *!/)
     * ```
     *
     * @param {string|string[]} stores - name of the stores where the transaction is spanning.
     * @param {string} store - name of the store to count from.
     * @param {string} indexName - name of the index
     * @param {string|number|Date|IDBKeyRange|IDBArrayKey} indexValue - optional value. when present, only the objects
     *  whose indices matches the value will be counted.
     * @return {Promise<number>} - a promise that may resolve with the count or fail altogether with an `Error`.
     */
    IDBService.prototype.countObjectsByIndex = function (stores, store, indexName, indexValue) {
        return this._getTransaction_(stores).then(function (trans) {
            return new Promise(function (resolve, reject) {
                trans.onerror = function (evt) { reject(evt); };
                trans.objectStore(store).index(indexName).count(indexValue).onsuccess =
                    function (evt) {
                        var count = evt.target.result;
                        resolve(count);
                    };
            });
        });
    };
    /**
     * @description remove objects from the store by using index.
     *
     * ### Example
     *
     * ```typescript
     * class Customer{
     *  constructor(public id: number, public name: string, public phone: [string]) {}
     * }
     *
     * idbService.removeObjectsByIndex(['customers'], 'customers', 'phone', '1234567890' )
     *  .then(deletedKeys => /!* your code... *!/)
     *  .catch(err => /!* handle errors *!/)
     * ```
     * @param {string|string[]} stores - name of the stores where the transaction is spanning.
     * @param {string} store - name of the store where the operation is affecting
     * @param {string} indexName - name of the index to lookup
     * @param {string|number|Date|IDBKeyRange|IDBArrayKey} indexVal - value of the index. Any match will be removed.
     * @return {Promise<string[]|number[]|Date[]|IDBKeyRange[]|IDBArrayKey[]>} - a promise that may eventually resolve with an array of deleted keys. Or fail altogether
     *  with an `Error`.
     */
    IDBService.prototype.removeObjectsByIndex = function (stores, store, indexName, indexVal) {
        return this._getTransaction_(stores, 'readwrite').then(function (trans) {
            var objectStore = trans.objectStore(store);
            /* use index to find keys */
            var request = objectStore.index(indexName).openKeyCursor(indexVal);
            /* return promise */
            return new Promise(function (resolve, reject) {
                trans.onerror = function (evt) {
                    reject(evt);
                };
                var keysToDelete = [];
                /* iterate keys when we're ready */
                request.onsuccess = function (evt) {
                    var cursorWithValue = evt.target.result;
                    if (cursorWithValue) {
                        keysToDelete.push(cursorWithValue.primaryKey);
                        cursorWithValue.continue();
                    }
                    else {
                        resolve(keysToDelete);
                    }
                };
            }).then(function (keys) { return Promise.all(keys.map(function (key) { return new Promise(function (resolve, reject) {
                var req = objectStore.delete(key);
                req.onsuccess = function () {
                    resolve(key);
                };
                req.onerror = function (evt) {
                    reject(evt);
                };
            }); })); });
        });
    };
    /**
     * @description Delete an object store and the therefore all the stored objects in it.
     * @param store {string} name of the store to delete
     * @return {Promise<void>} returns a promise that will be full-filled or rejected open
     *	completion.
     */
    IDBService.prototype.clearStore = function (store) {
        return this._getTransaction_(store, 'readwrite')
            .then(function (trans) {
            return new Promise(function (resolve, reject) {
                trans.oncomplete = function (evt) { resolve(); };
                trans.onerror = function (err) { reject(err); };
                trans.objectStore(store).clear();
            });
        });
    };
    IDBService = __decorate([
        core_1.Injectable(),
        __param(0, core_1.Inject(exports.IDB_DI_CONFIG)), 
        __metadata('design:paramtypes', [Object])
    ], IDBService);
    return IDBService;
}());
exports.IDBService = IDBService;
//# sourceMappingURL=idb.service.js.map