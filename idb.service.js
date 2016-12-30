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
var _ = require('lodash');
/* stupid cast operation */
function cast(param) {
    return param;
}
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
        this.onupgradeneeded = idbServiceConfig.onupgradeneeded;
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
            return Promise.reject(e);
        }
        /*  */
        return new Promise(function (resolve, reject) {
            /* bind onerror event on rejection */
            request.onerror = reject;
            /* bind onsuccess event on resolve */
            request.onsuccess = function (evt) { resolve(evt.currentTarget.result); };
            /* when upgrade is needed */
            request.onupgradeneeded = function (evt) { resolve(_this.onupgradeneeded(evt.currentTarget.result)); };
        });
    };
    // get transaction
    IDBService.prototype.getTransaction = function (stores, mode) {
        if (mode === void 0) { mode = "readonly"; }
        return this._init_().then(function (db) { return db.transaction(stores, mode); });
    };
    /**
     * @description performs read operation from the database.
     * @param stores {string|Array<string>} an array of `object` `store`s where the read operation will span
     * @param store {string} name of the store we need to read from
     * @param params {GetParams<T>} The optional parameters supplied to te operation
     * @param op {(any) => T} optional casting operator
     * @return {Promise<T>} a promise of result from the database.
     */
    IDBService.prototype.getByKey = function (stores, store, params) {
        if (_.isUndefined(params.values)) {
            return Promise.reject(Error("at least one value for the object's key needs to be passed!"));
        }
        var fn = params.castOp || cast;
        return this.getTransaction(stores).then(function (trans) {
            var request = trans.objectStore(store).get(params.values);
            return new Promise(function (resolve, reject) {
                request.onerror = function (errorEvent) { reject(errorEvent); };
                request.onsuccess = function (evt) {
                    resolve(fn(evt.target.result));
                };
            });
        });
    };
    /**
     * @description fetches records from the database.
     * @param stores {string|Array<string>} an array of `object` `store`s (scope) from when the read operation will span
     * @param store {string} name of the store we need to read from
     * @param params {GetParams} optional parameters supplied to the query
     * @return {Promise<Array<T>>}
     */
    IDBService.prototype.getAll = function (stores, store, params) {
        var fn = (params && params.castOp) || cast;
        return this.getTransaction(stores)
            .then(function (trans) {
            var cursorReq = trans.objectStore(store)
                .openCursor(params && params.values, (params && params.reverse) ? "prev" : undefined);
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
     * @description fetches a single object from the database using indexed property
     * @param stores {string|Array<string>} store name(s) from which our query needs to span.
     * @param store {string} name of the object store we need to read from
     * @param params {GetParams<T>} parameters that narrows down our matches. Particaulary,
     * 	you may need to define `index` and `values` parameters.
     * @return {Promise<T>} a promise of `T` object item from the database.
     */
    IDBService.prototype.getOneByIndex = function (stores, store, params) {
        if (_.isUndefined(params.index)) {
            return Promise.reject(Error("getOneByIndex() needs name of the index!"));
        }
        if (_.isUndefined(params.values)) {
            return Promise.reject(Error("getOneByIndex() needs at least one value."));
        }
        // used to cast
        var fn = params.castOp || cast;
        return this.getTransaction(stores).then(function (trans) {
            var req = trans.objectStore(store).index(params.index).get(params.values);
            return new Promise(function (resolve, reject) {
                req.onerror = function (errorEvt) {
                    reject(errorEvt);
                };
                req.onsuccess = function (evt) {
                    resolve(fn(evt.target.result));
                };
            });
        });
    };
    /**
     * @description fetches all records from the database matching the index's value.
     * @param stores {string|Array<string>} the store object(s) of which our search operation will span.
     * @param store {string} name of the object store we need to particulary search from
     * @param params {GetParams<T>} parameters that narrows down matches. Specifically, you may
     * need to define `index` parameter.
     * @return {Promise<Array<T>>} a promise of  an array of`<T>` object items from the database.
     */
    IDBService.prototype.getAllByIndex = function (stores, store, params) {
        if (_.isEmpty(params.index)) {
            return Promise.reject("getAllByIndex<T>() needs at least one index!");
        }
        var fn = params.castOp || cast;
        return this.getTransaction(stores).then(function (trans) {
            var cursorReq = trans.objectStore(store)
                .index(params.index).openCursor(params.values, params.reverse ? "prev" : null);
            return new Promise(function (resolve, reject) {
                cursorReq.onerror = function (errorEvt) {
                    reject(errorEvt);
                };
                var ret = [];
                cursorReq.onsuccess = function (evt) {
                    var cursorWithValue = evt.target.result;
                    if (cursorWithValue) {
                        ret.push(fn(cursorWithValue.value));
                        cursorWithValue.continue();
                    }
                    else {
                        resolve(ret);
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
    IDBService.prototype.removeByKey = function (stores, store, keyRange) {
        return this.getTransaction(stores, 'readwrite').then(function (trans) {
            var objectStore = trans.objectStore(store).delete(keyRange);
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
     * @description updates an item from the database.
     * @param stores {string|Array<string>} the store object(s) of which our search operation will span.
     * @param store {string} name of the object store we need to particulary search from
     * @param params {PutParams} important parameters needed in order to edit the object
     * @return {Promise<T>} a promise that may eventually resolve with edited `<T>` item record
     *	or fail with an error upon completion.
     */
    IDBService.prototype.updateByIndex = function (stores, store, params) {
        if (_.isUndefined(params.index)) {
            return Promise.reject(Error("updateByIndex() needs an index!"));
        }
        if (_.isUndefined(params.name)) {
            return Promise.reject(Error("updateByIndex() needs name of the object\'s property!"));
        }
        var transPromise = this.getTransaction(stores, "readwrite");
        var retPromise = transPromise.then(function (trans) {
            // getByIndex
            var req = trans.objectStore(store).get(params.index);
            /* inner promise */
            return new Promise(function (resolve, reject) {
                req.onsuccess = function (evt) {
                    var object = evt.target.result;
                    /* update the record */
                    object[params.name] = params.value;
                    var req2 = trans.objectStore(store).put(object);
                    trans.onerror = function (errEvt) { reject(errEvt); };
                    trans.oncomplete = function (evt) { resolve(); };
                };
            });
        });
        return retPromise;
    };
    /**
     * @description adds item(s) to the database
     * @param store {string} name of the store
     * @param data {Array<T>} an array object to store in the database.
     * @param {Array<R>} an array of keys for the items
     */
    IDBService.prototype.add = function (store, data) {
        return this.getTransaction(store, "readwrite").then(function (trans) {
            var objectStore = trans.objectStore(store);
            var promise1 = data.map(function (d) { return objectStore.add(d); })
                .map(function (req) { return new Promise(function (resolve, reject) {
                req.onerror = function (errEvt) { reject(errEvt); };
                req.onsuccess = function (evt) { resolve(); };
            }); });
            var promise2 = new Promise(function (resolve, reject) {
                /*
                 * To determine if the add operation has completed successfully,
                 * listen for the transaction’s complete event in addition to the
                 * IDBObjectStore.add request’s success event, because the transaction
                 * may still fail after the success event fires. In other words,
                 * the success event is only triggered when the transaction has been successfully queued.
                 */
                trans.oncomplete = function (evt) {
                    resolve();
                };
                /* error event bubbles up */
                trans.onerror = function (errEvt) {
                    reject(errEvt);
                };
            });
            return Promise.all([promise1, promise2]);
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