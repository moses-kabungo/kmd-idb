
import {Inject, Injectable, OpaqueToken} from '@angular/core';

/* stupid cast operation */
function cast<T>(param: any): T {
	return param as T;
}

const noop = () => {};

/**
 * @description The qualifier used by Angular's injector. Client code must
 * provide the implementation of {@code IDBServiceConfig}.
 */
export const IDB_DI_CONFIG = new OpaqueToken("com.github.kbngmoses.kmdIndexedDB");

/**
 * @description design time interface used to configure {@link IDBService}.
 */
export declare interface IDBServiceConfig {
	/**
	 * @description name of the database
	 * @type string
	 */
	database: string;

	/**
	 * @description version number of the database schema.
	 * @type number
	 */
	version: number;

	/**
	 * @description the callback is invoked when the database is created or when
	 * upgrade is needed.
	 * @type Function
	 * @param db {IDBDatabase} database instance.
	 * @return {IDBDatabase} returns the same instance that was passed to it
	 */
	onUpgradeNeeded: (db: IDBDatabase) => IDBDatabase;

	/**
	 * @description the callback to execute when the structure of the database
	 * 	is altered, either when an upgrade is needed or when the database is destroyed.
	 *	It is important to note that, when the callback returns false, the onUpgradeNeeded
	 *	callback method will not be invoked.
	 * @param db {IDBDatabase} database instance
	 * @return {boolean} return true if the onUpgradeNeeded should be invoked. Returns false otherwise
	 */
	onVersionChange?: (db: IDBDatabase) => boolean;

	/**
	 * @description When your web app changes in such a way that a version change is
	 * 	required for your database, you need to consider what happens if the user has
	 *	the old version of your app open in one tab and then loads the new version of
	 *	your app in another. When you call open() with a greater version than the actual
	 *	version of the database, all other open databases must explicitly acknowledge
	 *	the request before you can start making changes to the database (an onblocked
	 *	event is fired until they are closed or reloaded).
	 */
	onBlocked?: () => void
}

export declare interface PutParams<T> {
	/**
	 * index of the object we need to modify
	 */
	index?: string|IDBKeyPath;

	/**
	 * name of the object's parameter we need to modify
	 * @type string
	 */
	name: string;
	
	/**
	 * value of the parameter we're interested in
	 */
	value: T;
}

@Injectable()
export class IDBService {

	database: string;
	version: number;
	onupgradeneeded: (db: IDBDatabase) => IDBDatabase;
	private onblocked: () => void;
	private _db: IDBDatabase;

	constructor ( @Inject(IDB_DI_CONFIG) private idbServiceConfig: IDBServiceConfig ) {
		this.database = idbServiceConfig.database;
		this.version  = idbServiceConfig.version;
		this.onupgradeneeded = idbServiceConfig.onUpgradeNeeded;
		this.onblocked = idbServiceConfig.onBlocked === undefined ? 
			noop : idbServiceConfig.onBlocked;
		idbServiceConfig.onVersionChange = idbServiceConfig.onVersionChange === undefined ?
			(db: IDBDatabase) => { return true; } : idbServiceConfig.onVersionChange;
	}

	/* throws TypeError when the value of version is zero or a negative number or not a number. */
	_init_(): Promise<IDBDatabase> {

		let indexedDB: IDBFactory = window.indexedDB 
			/*|| window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB*/;
		
		if ( !indexedDB ) {
			return Promise.reject( new Error( 'Browser kit does not support indexedDB' ));
		}

		// the first parameter of IDBFactory.open() is the name of the database
		// the second parameter is the version of the database. The version of the
		// database determines the schema. The object stores in the database and their
		// structures.
		//
		// if the database doesn't already exist, the open method will create one for you.
		// then the onupgrateneeded event is triggered, allowing you to specify an updated
		// schema in its handler. 
		let request: IDBOpenDBRequest;

		// IDBFactory.open() throws TypeError when the version is negative
		try {
			request = indexedDB.open( this.database, this.version );
		} catch (e) {
			return Promise.reject( "ERROR: " + e );
		}

		/* handle everything else in the promise */
		return new Promise((resolve, reject) => {

			const attachOnVersionChange = ( db: IDBDatabase ) => {
				/*db.onversionchange = (evt) => {
					console.log('Version Change...');	
				};*/
				this.idbServiceConfig.onVersionChange(db);
				return db;
			};

			/* bind onerror event and reject the promise */
			request.onerror = (evt) => { reject(evt); };
			/* bind onsuccess event and resolve the promise */
			request.onsuccess = ( evt ) => {
				const db = (<IDBOpenDBRequest>evt.target).result;
				resolve(db);
			};
			/* bind onpgradeneeded event and execute client callback whenever necessary */
			request.onupgradeneeded = ( evt: IDBVersionChangeEvent ) => {
				const db = (<IDBOpenDBRequest>evt.currentTarget).result;

				if (this.idbServiceConfig.onVersionChange(db)) {
					this.idbServiceConfig.onUpgradeNeeded(db);
				}

			};
			/* when the database can't be opened because of different versions in application instances */
			request.onblocked = () => {
				this.onblocked();
			};
		});
	}


	/* all database operations are wrapped in a transaction */
	private _getTransaction_( stores: string|Array<string>, mode: string = "readonly" ): Promise<IDBTransaction> {
		return this._init_().then( db => db.transaction(stores, mode));
	}

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
	getObjectByKey<T>(stores: string | Array<string>,
		store: string, range: string|number|Date|IDBKeyRange|IDBArrayKey, _cast?: (...params: any[]) => T): Promise<T> {
		
		/*
		 * if the client didn't supply the cast operator, we will add
		 * the default implementation that simply casts the retrieved objects into
		 * requested type.
		 */
		const fn =  _cast || cast;

		/* wrap every operation under a transaction */
		return this._getTransaction_(stores).then( trans => {

			/* construct the request. */
			const request = trans.objectStore(store).get(range);

			/* return the promise */
			return new Promise<T>((resolve, reject) => {
				request.onerror = (errorEvent) => { reject(errorEvent); };
				request.onsuccess = (evt) => {
					resolve( fn<T>((<IDBRequest>evt.target).result)); };
			});
		});
	}

	/**
	 * @description get an array of stored objects, optionally using key
	 * @param stores {string|Array<string>} an array of `object` `store`s (scope) from when the read operation will span
	 * @param store {string} name of the store we need to read from
	 * @param params {GetParams} optional parameters supplied to the query
	 * @return {Promise<Array<T>>}
	 */
	getObjects<T>(stores: string|Array<string>, 
		store: string, keyRange?: IDBKeyRange, reverse: boolean = false, _cast?: (...params:any[]) => T): Promise<Array<T>> {

		const fn = _cast || cast;
		return this._getTransaction_( stores ).then( trans => {
				
			const cursorReq = trans.objectStore(store)
				.openCursor(
					keyRange === undefined ? undefined : keyRange, 
					reverse ? undefined : "prev");

			const res: T[] = [];
			return new Promise<Array<T>>((resolve, reject) => {
				cursorReq.onerror = (errorEvt) => { reject(errorEvt) };
				cursorReq.onsuccess = (evt) => {
					let cursor: IDBCursorWithValue = (<IDBRequest>evt.target).result;
					if (cursor) {
						res.push( fn<T>( cursor.value ) );
						cursor.continue();
					} else {
						resolve( res );
					}
				};
			});	
		});
	}

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
	getObjectsByIndex<T>(stores: string|string[], 
		store: string, index: string, range?: string|number|Date|IDBKeyRange|IDBArrayKey,
		reverse: boolean=false, _cast?:(...params: any[]) => T ): Promise<T[]> {
		const fn = _cast || cast;
		return this._getTransaction_(stores).then( trans => {
			
			const _index_ = trans.objectStore(store).index(index).openCursor(range, reverse ? "prev" : undefined);
			const res: T[] = [];
			return new Promise<T[]>((resolve, reject) => {

				trans.onerror    = (evt) => { console.error(evt); reject(evt); };
				_index_.onsuccess = (evt) => {
					let cursor: IDBCursorWithValue = (<IDBRequest>evt.currentTarget).result;
					if (cursor) {
						res.push(fn<T>(cursor.value));
						cursor.continue();
					} else {
						resolve(res);
					}
				}; 

			});
		});
	}

	/**
	 * @description deletes item record(s) from the database.
	 * @param stores {string|Array<string>} the store object(s) of which our search operation will span.
	 * @param store {string} name of the object store we need to particulary search from
	 * @param keyRage {IDBKeyRange} the key constraint of the object in the store we need to delete.
	 * @return {Promise<any>} a promise that may enventually resolve or fail upon completion.
	 */
	removeObjectsByKey(stores: string|Array<string>,
			store: string, range: IDBKeyRange
	): Promise<any> {
		return this._getTransaction_(stores, 'readwrite').then(trans => {
			trans.objectStore(store).delete( range );
			return new Promise((resolve, reject) => {
				trans.onerror = (errorEvt) => {
					reject(errorEvt);
				};

				trans.oncomplete = (evt) => {
					resolve();
				};
			});
		});
	}

	/**
	 * @description Find and replaces a value in the store.
	 * 	If you certainly does not need to replace the object, You should instead 
	 *	use {@link #updateObjectByIndex}
	 * @param store {string} name of the object store we need to particulary search from
	 * @param params {PutParams} important parameters needed in order to edit the object
	 * @return {Promise<T>} a promise that may eventually resolve with edited `<T>` item record 
	 *	or fail with an error upon completion.
	 */
	replaceObjectByKey<T>(store: string, key: string|number|Date|IDBKeyRange, value: T): Promise<T> {
		
		if (key === undefined || key === null) {
			return Promise.reject(Error("updateByIndex() needs a key value!"));
		}

		const transPromise = this._getTransaction_(store, "readwrite");
		const retPromise   = transPromise.then(trans => {

			/* inner promise */
			return new Promise((resolve, reject) => {
				// wait for the transaction to complete
				trans.oncomplete = () => { resolve(value); }
				trans.onerror = (evt) => { reject(evt.error) };

				// firstly, we're deleting the record from the database
				// because the key is going to be altered as well...
				trans.objectStore(store).delete(key)
					.onsuccess = (evt) => {
						trans.objectStore(store)
							.add(value)
							.onsuccess = (evt2) => {/*stub*/};
				};
			}) as Promise<T>;
		});

		return retPromise;
	}

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
	updateObjectsByIndex<T>(store: string,
		index: string , indexVal: string|number|Date|IDBKeyRange|IDBArrayKey,
		params: PutParams<any>[],
		allMatches: boolean = false
	): Promise<T[]> {
		// make sure client code hasn't forgotten to pass name and value
		if (params.length === 0)  {return Promise.reject(Error("updateByIndex() needs at least one PutParams"));}
		if ((index === undefined) || (index === null)) {return Promise.reject(Error('updateByProperty() needs index of the value!'));}

		// create the request
		return this._getTransaction_(store, 'readwrite').then(trans => {
			
			const objectStore = trans.objectStore(store);
			
			const promiseA = new Promise((resolve, reject) => {

				const updateOne = (oldValue: T): Promise<T> => {
					params.forEach(param => {
						oldValue[param.name] = param.value;
					});
					const req = objectStore.put(oldValue);
					return new Promise((f, g) => {
						req.onsuccess = (evt) => {
							f(oldValue);
						};
						req.onerror = (evt) => {
							g(evt);
						};
					});
				};

				// should we update all matches or just one match?
				if (allMatches) {
					const promises: Promise<T>[] = [];
					objectStore.index(index).openCursor(indexVal).onsuccess = (evt) => {
						const cursor: IDBCursorWithValue = (<IDBRequest>evt.target).result;
						if (cursor) {
							// reject immediately when we get an error
							promises.push(updateOne(cursor.value as T));
						} else {
							Promise.all(promises).then(values => resolve(values));
						}
					};
				} else {
					objectStore.index(index).get(indexVal).onsuccess = (evt) => {
						const value: T = (<IDBRequest>evt.currentTarget).result;
						updateOne(value).then( newValue => resolve(newValue));
					};
				}

			})

			const promiseB = new Promise((resolve, reject) => {
				trans.oncomplete = (evt) => { resolve() };
			});

			return Promise.all([promiseA, promiseB]).then((values) => {
				return [values[0]] as T[];
			});

		});
	}

	/**
	 * @description Create a structured clone of the value and store the value under the store.
	 * @param store {string} name of the store
	 * @param data {Array<T>} an array of values to store in the database.
	 * @return {Array<T>} an array of items to return from the database.
	 */
	storeObjects<T>(store: string, data: Array<T>): Promise<T[]> {
		return this._getTransaction_(store, "readwrite").then(trans => {

			const objectStore = trans.objectStore( store );

			const promiseA = new Promise((resolve, reject) => {
				/*
				 * To determine if the add operation has completed successfully, 
				 * listen for the transaction’s complete event in addition to the
				 * IDBObjectStore.add request’s success event, because the transaction
				 * may still fail after the success event fires. In other words,
				 * the success event is only triggered when the transaction has been successfully queued.
				 */
				trans.oncomplete = (evt) => {
					resolve(data);
				};

				/* error event bubbles up */
				trans.onerror = (errEvt) => {
					reject(errEvt);
				};
			});

			const promiseB = Promise.all(
				data.map(d => objectStore.add(d))
				.map( req => new Promise((resolve, reject) => {
					req.onerror = (errEvt) => { reject(errEvt); };
					req.onsuccess = (evt)  => { resolve(); };
				})));

			return Promise.all([ promiseA, promiseB ])
			// only project the first value
				.then(values => values[0]) as Promise<T[]>;
		});
	}

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
	countObjects(stores: string|string[], store: string): Promise<number> {
	    return this._getTransaction_(stores).then(trans => {
	       return new Promise((resolve, reject) => {
	           trans.onerror = (evt) => { reject(evt); };
	           trans.objectStore(store).count().onsuccess = (evt) => {
	               const count: number = (<IDBRequest>evt.target).result;
	               resolve(count);
               };
           });
        });
    }

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
    countObjectsByIndex(stores: string|string[], store: string, indexName: string, indexValue?: string|number|Date|IDBKeyRange|IDBArrayKey): Promise<number> {
        return this._getTransaction_(stores).then(trans => {
            return new Promise((resolve, reject) => {
                trans.onerror = (evt) => { reject(evt); };
                trans.objectStore(store).index(indexName).count(indexValue).onsuccess =
                    (evt) => {
                    const count: number = (<IDBRequest>evt.target).result;
                    resolve(count);
                };
            });
        });
    }

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
	removeObjectsByIndex(
	    stores: string|string[],store: string, indexName: string, indexVal: string|number|Date|IDBKeyRange|IDBArrayKey
        ): Promise<string[]|number[]|Date[]|IDBKeyRange[]|IDBArrayKey[]> {
        return this._getTransaction_(stores, 'readwrite').then(trans => {
            const objectStore = trans.objectStore(store);

            /* use index to find keys */
            const request = objectStore.index(indexName).openKeyCursor(indexVal);

            /* return promise */
            return new Promise<string[]|number[]|Date[]|IDBKeyRange[]|IDBArrayKey[]>(
                (resolve, reject) => {

                trans.onerror = (evt) => {
                    reject(evt);
                };

                const keysToDelete: any[] = [];

                /* iterate keys when we're ready */
                request.onsuccess = (evt) => {
                    const cursorWithValue: IDBCursorWithValue = (evt.target as IDBRequest).result;
                    if (cursorWithValue) {
                        keysToDelete.push(cursorWithValue.primaryKey);
                        cursorWithValue.continue();
                    } else {
                        resolve(keysToDelete);
                    }
                };
            }).then(keys => Promise.all((<any[]>keys).map(key => new Promise((resolve, reject) => {
                const req = objectStore.delete(key);
                req.onsuccess = () => {
                  resolve(key);
                };

                req.onerror = (evt) => {
                    reject(evt);
                };
            }))));
        });
    }

	/**
	 * @description Delete an object store and the therefore all the stored objects in it.
	 * @param store {string} name of the store to delete
	 * @return {Promise<void>} returns a promise that will be full-filled or rejected open
	 *	completion. 
	 */
	clearStore(store: string): Promise<void> {
		return this._getTransaction_(store, 'readwrite')
			.then(trans => {
				return new Promise<void>((resolve, reject) => {
					trans.oncomplete = (evt) => { resolve(); };
					trans.onerror = (err) => { reject(err); };
					trans.objectStore(store).clear();
				});
			});
	}
}