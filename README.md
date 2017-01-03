## Angular 2 Module for accessing indexedDB

When you consider crafting a web application that works offline, chances are you might enventually ending up using [indexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#Updating_an_entry_in_the_database), an object storage database for your web application. Great, NoSQL on your web app! Sound like you could even use something to do the heavy lifting for your application...

Angular is to indexedDB what butter is to bread. That is what this simple project is all about. *An angular 2 module that lets you access the indexedDB through high level asynchronous API*. No hassle. The asynchronous API [`Promise`s](https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Promise) stored objects.

The basic workflow when using the module involves:

* **Installing it through npm**
* **Configure it**
* **provide the service into your service or component** and
* **Inject and use it**

###  Installation

Let's assume you already have the required versions of node and npm installed on your system. To install the module through npm do an

```shell
npm install kmd-idb --save
```

If everything goes ok, then you are ready to take off.

### Configuring the module

To configure it, first do an `import {IDBModule, IDBServiceConfig} from 'kmd-idb'` in your root module. The module accepts a number of [options](#module-configuration-options).

```js
// Typing isn't real necessary but is needed here for brevity.
// IDE reminds us of the compulsory config options should we forget them,
// and explain them through JSDoc as we type. Thanks to TypeScript!
const idbConfigs: IDBServiceConfig = {
  /*
   * name of the database
   */
  database: '<name of your database>',
  /*
   * version of the database. This must be a unsigned long.
   * Everytime you use larger version number, the database
   * schema will be upgraded through `onupgradeneeded` which is the DOM
   * event explained below
   */
   version: <version number>,
   /*
    * you tell the indexedDB what schema (structure of the objects)
    * you need to use through this callback. The callback is invoked
    * everytime you use a higher version number than the previous one or
    * when the database is created for the first time.
    */
   onupgradeneeded: (db: IDBDatabase /*concise*/) => {
      // give name to your object store e.g
      // const store = db.createObjectStore('customers', {keyPath: 'email'});
      
      // tell the indexedDB which indecies we'are going to use when searching
      // our customers e.g.
      // store.createIndex('customer_full_name', {unique: false});
      // store.createIndex('customer_phone', {unique: true});
      // store.createIndex('email', {unique: true});

      // Perhaps even more object stores and indecies for your domain model...

      // restore IDBDatabase instance

      return db;
   } 
};

@NgModule({
	imports: [IDBModule.forRoot(idbConfigs)]
}) export class YourRootModuleClass {}
```

Finally, we need to instruct System JS where it should look for the module by adding the following in your `systemjs.config.js` file

```js
System.config({
  defaultJSExtension: 'true',
  map: {
    'kmd-idb': 'npm:kmd-idb/index'
  }
});
```

Ready? Great! Now the `IDBService` is closer to your application's [DI](https://angular.io/docs/ts/latest/guide/hierarchical-dependency-injection.html) tree. And you should probably [start injecting]() it in your components.

### Injecting the `IDBService`

As with many angular services, you might need to consider if you need a singleton service or a service that adhares to the lifecycle of the component. The rule of thumb is to choose a singleton service when you need only one instance of the service across all your application's components. Othwerwise, choose to inject the service per component basis.

Fistly, import the service whenever you need to use it as

```js
import {IDBService} from 'kmd-idb';
```

#### Injecting A Singleton Service

To inject a singleton service, go to the root module of your application and register the service in the `providers` array. i.e

```js
@NgModule({
    providers: [IDBService]
}) export class YourRootModuleClass {}
```

#### Injecting `IDBService` per Component

If you decide you need to use the `IDBService` per application component, then register it in the `providers` array of the corresponding component. i.e

```js
@Component({
    providers: [IDBService]
}) export class YourComponent {}
```

### Examples

#### Fetching Objects. `IDBService.getObjects()`

Say you need to fetch objects from the store named `customers`. The API returns the `Promise` of `Customer` objects through the `IDBService.getObjects()`

```js
const customersPromise: Promise<Customer> = 
  idbService.getObjects<Customer>(["customers"], "customers");

customersPromise.then(customers => /* do something with the customers */)
  .catch(err => /* fail gracefully */);
```

#### Fetching An Object by Key. `IDBService.getObjectByKey()`

The service defines the method `IDBService.getObjectByKey([stores], store, key)` that is used to fetch object stored under the key.

```js
const customersPromise: Promise<Customer> =
  idbService.getObjectByKey<Customer>(
    ["customers"], "customer", IDBKeyRange.only("someone@example.com"));

customersPromise.then(customer => /*do something with the customer*/)
  .catch(err => /* fail gracefully */);
```

#### Store An Object. `IDBService.storeObjects()`

Use the method `IDBService.storeObjects(store, [objects])` to store objects. The method returns an array of stored objects so that you can do something useful with the results, such as, updating user interface by appending newly created objects.

Here is how you would use it:

```js
const newCustomersPromise: Promise<Customer> =
  idbService.storeObjects(
    ["customers"], [{name: "DNA Publishers", email: "dbapubs@company.com"}]);
newCustomersPromise.then(customers => /* do something useful */)
  .catch(err => /* fail gracefully */);
```

##### NOTE
>`IDBService` merits from the indexedDB API by wrapping all the operations in a transaction. If one of the operation in a batch under transaction fails, the transaction is rolled back.

>An attempt to store more than one object with similar keys will result into an exception.

##### HINT
>Use the the stored objects when the promise is resolved instead of reloading objects from the database. This is a common scenareo!

#### Updating Stored Objects. `IDBService.updateObjectsByIndex()`

Use the method `IDBService.updateObjectsByIndex(store, indexName, indexVal, [params])` to update objects in a store. By default, the method will update only the first matching object. It is possible to control the number of matching objects by using `index` range and by adding `true` as the fourth argument to the method.

The fourth argument is assigned to the `boolean` parameter that hints the method if it should update as many matching objects as possible. Default is false which means only the first match is updated.

```js
const updatePromise: Promise<Customer> =
  idbService.updateObjectsByIndex<Customer>(
    "customers", "name", "DNA Publishers", [{ name: 'name', value: 'DMA Publishers' }]
    /*, true --- to update all objects whose name is DNA Publishers */)
updatePromise.then(newCustomers => /* replace old customers */)
  .catch(err => /* fail gracefully */);
```

##### NOTE
> You cannot and you should not update the keyPath (object's property that you specified as the keyPath, aka the primary key). Doing so will always result into an exception being thrown. Instead, the `IDBService` provides the method `replaceObjectByKey()` method that deletes the object and add newer one.

#### Deleting Stored Object `IDBService.removeObjectsByKey()`

Use the method `IDBService.removeObjectsByKey([stores], store, index)` to delete objects from the store.

Here is how you would do it

```js
const deletePromise = idbService
  .removeObjectsByKey<Customer>(["customers"], "customer", IDBKeyRange.between(
      "DMA Publisher", "FNX Couriers"));
deletePromise.then(_ => /* do something */)
  .catch(err => /* fail gracefully */)
```


#### Replacing an Object. `IDBService.replaceObjectByKey()`

Sometimes you just need to replace the object in a store. Internally, the `IDService` erase and add new object. So you may accomplish this operation by chaining the two operations. But that requires you to type many lines. Not to mention it involves two distinct database transactions in the invent loop.

To replace an object, just use `IDBService.repalaceObjectByKey(store, keyVal, object)` as

```js
const replacePromise: Promise<Customer> = idbService
  .replaceByKey('customers', 'dmapublishers@example.com', newData);

replacePromise.then(replacedRecord => /* do something useful */)
  .catch(err => /* fail gracefully */)
```

##### HINT
> Use the returned record by replacing the old record in your collection.

### Module Configuration Options

Following are the configuration parameters expected by the module.

|Name of the Parameter|Type|Description|
|-----------------------|------|------------|
|`database`(required)|`string`|Name of the database that will be used by your application.|
|`version`(required)|`unsigned long long`|Version of the current database schema. If you increment this number, the database schema will upgraded by invoking the `onUpgradeNeeded` shown below.|
|`onUpgradeNeeded`(required)|`(IDBDatabase)=>IDBDdatabase`|The callback function that is invoked when an upgrade is needed, specifically because the version number has been increased or when the database is created for the first time.
|`onVersionChange`(optional)|`(IDBDatabase)=>boolean`|The callback to execute when the structure of the database is altered, either when an upgrade is needed or when the database is destroyed. When you return false in the callback, the `onUpgradeNeeded` will never get executed.|
|`onBlocked`(optional)|`()=>void`|When your web app changes in such a way that a version change is required for your database, you need to consider what happens if the user has the old version of your app open in one tab and then loads the new version of your app in another. When you specify schema changes with a greater version than the actual version of the database, all other open databases must explicitly acknowledge the request before you can start making changes to the database (an onblocked event is fired until they are closed or reloaded).|

### LICENSE

**The MIT License (MIT)**

**Copyright (c) 2017 Moses Kabungo and contributors**

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.