
import {Inject, Injectable, OpaqueToken} from '@angular/core';

import * as _ from 'lodash';

/* stupid cast operation */
function cast<T>(param: any): T {
	return param as T;
} 

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
	 */
	onupgradeneeded: (db: IDBDatabase) => IDBDatabase;
}

/**
 * @description Extra optional parameters used by methods of the {@link IDBService} service.
 */
export declare interface GetParams<T> {
	/**
	 * @description sorting determines the sorting order for the items. If true, items are sorted in
	 * descending order. Normally, the default is ascending order
	 */
	reverse?: boolean;

	/**
	 * @description name of the index
	 * @type string
	 */
	index?: string|IDBKeyPath; 

	/**
	 * @description constraints used to match objects from their stores.
	 */
	values?: string|number|Date|IDBKeyRange|IDBArrayKey;

	/**
	 * @description removes duplicate from the matching objects by 
	 * returning only the first object item that matches the criteria.
	 */
	unique?: boolean;

	/**
	 * @description casting operator used to perform conversion between typings
	 */
	castOp?: (...a: any[]) => T;
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

	private database: string;
	private version: number;
	private onupgradeneeded: (db: IDBDatabase) => IDBDatabase;
	private _db: IDBDatabase;

	constructor ( @Inject(IDB_DI_CONFIG) private idbServiceConfig: IDBServiceConfig ) {
		this.database = idbServiceConfig.database;
		this.version  = idbServiceConfig.version;
		this.onupgradeneeded = idbServiceConfig.onupgradeneeded; 
	}

	/* throws TypeError when the value of version is zero or a negative number or not a number. */
	private _init_(): Promise<IDBDatabase> {

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
			return Promise.reject( e );
		}

		/*  */
		return new Promise((resolve, reject) => {
			/* bind onerror event on rejection */
			request.onerror = reject;
			/* bind onsuccess event on resolve */
			request.onsuccess = ( evt ) => { resolve( (<IDBOpenDBRequest>evt.currentTarget).result ); }
			/* when upgrade is needed */
			request.onupgradeneeded = ( evt ) => { resolve( this.onupgradeneeded( (<IDBOpenDBRequest>evt.currentTarget).result )); }
		});
	}


	// get transaction
	private getTransaction( stores: string|Array<string>, mode: string = "readonly" ): Promise<IDBTransaction> {
		return this._init_().then( db => db.transaction(stores, mode));
	}

	/** 
	 * @description performs read operation from the database.
	 * @param stores {string|Array<string>} an array of `object` `store`s where the read operation will span
	 * @param store {string} name of the store we need to read from
	 * @param params {GetParams<T>} The optional parameters supplied to te operation
	 * @param op {(any) => T} optional casting operator
	 * @return {Promise<T>} a promise of result from the database.
	 */
	getObjectByKey<T>(stores: string | Array<string>, store: string, params: GetParams<T>): Promise<T> {
		
		if (_.isUndefined( params.values )) {
			return Promise.reject(
				Error("at least one value for the object's key needs to be passed!"));
		}

		const fn = params.castOp || cast;

		return this.getTransaction(stores).then( trans => {
				const request = trans.objectStore(store).get(params.values);
				return new Promise<T>((resolve, reject) => {
					request.onerror = (errorEvent) => { reject(errorEvent); };
					request.onsuccess = (evt) => {
						resolve( fn<T>((<IDBRequest>evt.target).result)); };
				});
			});
	}

	/**
	 * @description fetches records from the database.
	 * @param stores {string|Array<string>} an array of `object` `store`s (scope) from when the read operation will span
	 * @param store {string} name of the store we need to read from
	 * @param params {GetParams} optional parameters supplied to the query
	 * @return {Promise<Array<T>>}
	 */
	getObjects<T>(stores: string|Array<string>, 
		store: string, params?: GetParams<T> ): Promise<Array<T>> {

		const fn = (params && params.castOp) || cast;
		return this.getTransaction( stores )
			.then( trans => {
				
				const cursorReq = trans.objectStore(store)
					.openCursor( params && params.values, (params && params.reverse) ? "prev": undefined );

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
	 * @description fetches a single object from the database using indexed property
	 * @param stores {string|Array<string>} store name(s) from which our query needs to span.
	 * @param store {string} name of the object store we need to read from
	 * @param params {GetParams<T>} parameters that narrows down our matches. Particaulary,
	 * 	you may need to define `index` and `values` parameters.
	 * @return {Promise<T>} a promise of `T` object item from the database. 
	 */
	getObjectByIndex<T>(stores: string|Array<string>,
		store: string, params: GetParams<T>): Promise<T> {

		if (_.isUndefined(params.index)) {
			return Promise.reject( Error( "getOneByIndex() needs name of the index!" ));
		}

		if (_.isUndefined(params.values)) {
			return Promise.reject( Error("getOneByIndex() needs at least one value.") );
		}

		// used to cast
		const fn = params.castOp || cast;
		

		return this.getTransaction(stores).then(trans => {
			const req = trans.objectStore(store).index(params.index).get(params.values);
			return new Promise<T>((resolve, reject) => {
				req.onerror = (errorEvt) => {
					reject(errorEvt);
				};
				req.onsuccess = (evt) => {
					resolve(fn<T>((<IDBRequest>evt.target).result));
				}
			});
		});
	}

	/**
	 * @description fetches all records from the database matching the index's value.
	 * @param stores {string|Array<string>} the store object(s) of which our search operation will span.
	 * @param store {string} name of the object store we need to particulary search from
	 * @param params {GetParams<T>} parameters that narrows down matches. Specifically, you may
	 * need to define `index` parameter.
	 * @return {Promise<Array<T>>} a promise of  an array of`<T>` object items from the database.
	 */
	getObjectsByIndex<T>(stores: string|Array<string>,
		store: string, params: GetParams<T>): Promise<Array<T>> {

		if (_.isEmpty(params.index)) {
			return Promise.reject( "getAllByIndex<T>() needs at least one index!" );
		}

		const fn = params.castOp || cast;
		return this.getTransaction(stores).then(trans => {
			const cursorReq = trans.objectStore(store)
				.index(params.index).openCursor(params.values, params.reverse ? "prev": null);
			return new Promise<Array<T>>((resolve, reject) => {
				cursorReq.onerror = (errorEvt) => {
					reject(errorEvt);
				};
				const ret: T[] = [];
				cursorReq.onsuccess = (evt) => {
					const cursorWithValue: IDBCursorWithValue = (<IDBRequest>evt.target).result;
					if( cursorWithValue ) {
						ret.push( fn<T>( cursorWithValue.value ));
						cursorWithValue.continue();
					} else {
						resolve(ret);
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
	removeObjectByKey(stores: string|Array<string>,
			store: string, keyRange: IDBKeyRange
	): Promise<any> {
		return this.getTransaction(stores, 'readwrite').then(trans => {
			const objectStore = trans.objectStore(store).delete( keyRange );
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
		
		if (_.isUndefined(key)) {
			return Promise.reject(Error("updateByIndex() needs a key value!"));
		}

		const transPromise = this.getTransaction(store, "readwrite");
		const retPromise   = transPromise.then(trans => {

			/* inner promise */
			return new Promise((resolve, reject) => {
				// wait for the transaction to complete
				trans.oncomplete = () => { resolve(value); }
				trans.onerror = (evt) => { reject(evt) };

				// firstly, we're deleting the record from the database
				// because the key is going to be altered as well...
				const req = trans.objectStore(store).delete(key);

				req.onsuccess = (evt) => {
					trans.objectStore(store)
						.add(value)
						.onsuccess = (evt2) => { console.log("Done!") };
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
	 * @param index {string|number|Date|IDBKeyRange} the index we're using to match 
	 *	the values in the store. 
	 * @param allMatches {boolean} if set to true, all the matching records for the given
	 * 	property value will be updated. Default is false.
	 * @return {Promise<R[]>} a promise that will enventually be fullfilled with 
	 * 	the new updated stored values or fail with an error
	 */
	updateObjectByIndex<T>(store: string,
		index: string|number|Date|IDBKeyRange , params: PutParams<any>[], allMatches: boolean = false): Promise<T[]> {
		// make sure client code hasn't forgotten to pass name and value
		if (params.length === 0)  {return Promise.reject(Error("updateByIndex() needs at least one PutParams"));}
		if (_.isUndefined(index)) {return Promise.reject(Error('updateByProperty() needs index of the value!'));}

		// create the request
		return this.getTransaction(store, 'readwrite').then(trans => {
			
			const objectStore = trans.objectStore(store);
			
			const promiseA = new Promise((resolve, reject) => {

				const updateOne = (oldValue: T) => {
					params.forEach(param => {
						oldValue[param.name] = param.value;
					});
					const req = objectStore.put(oldValue);
					return new Promise((f, g) => {
						req.onsuccess = (evt) => {
							resolve(oldValue);
						};
						req.onerror = (evt) => {
							reject(evt);
						};
					});
				};

				if (allMatches) {
					const promises: Promise<T>[] = [];
					objectStore.openCursor(index).onsuccess = (evt) => {
						const cursor: IDBCursorWithValue = (<IDBRequest>evt.target).result;
						if (cursor) {
							// reject immediately when we get an error
							promises.push(updateOne(cursor.value as T));
						} else {
							Promise.all(promises).then(values => resolve(values));
						}
					};
				} else {
					objectStore.get(index).onsuccess = (evt) => {
						const cursor: IDBCursorWithValue = (<IDBRequest>evt.target).result;
						updateOne(cursor.value as T).then(value => resolve([value]));
					};
				}

			}) as Promise<T[]>;

			const promiseB = new Promise((resolve, reject) => {
				trans.oncomplete = (evt) => { resolve() };
			});

			return Promise.all([promiseA, promiseB]).then((values) => values[0] as T[]);

		});
	}

	/**
	 * @description Create a structured clone of the value and store the value under the store.
	 * @param store {string} name of the store
	 * @param data {Array<T>} an array of values to store in the database.
	 * @return {Array<T>} an array of items to return from the database.
	 */
	storeObjects<T>(store: string, data: Array<T>): Promise<T[]> {
		return this.getTransaction(store, "readwrite").then(trans => {

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
	 * @description Delete an object store and the therefore all the stored objects in it.
	 * @param store {string} name of the store to delete
	 * @return {Promise<void>} returns a promise that will be full-filled or rejected open
	 *	completion. 
	 */
	clearStore(store: string): Promise<void> {
		return this.getTransaction(store, 'readwrite')
			.then(trans => {
				return new Promise<void>((resolve, reject) => {
					trans.oncomplete = (evt) => { resolve(); };
					trans.onerror = (err) => { reject(err); };
					trans.objectStore(store).clear();
				});
			});
	}

}