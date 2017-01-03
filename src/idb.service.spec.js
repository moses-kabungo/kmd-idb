"use strict";
var testing_1 = require('@angular/core/testing');
var idb_service_1 = require('./idb.service');
/* isolated test... no angular testing utils */
describe('IDBService', function () {
    var config;
    var service;
    var objects = [
        { name: 'Moses', email: 'kbng.moses@gmail.com', doB: '1989-7-29' },
        { name: 'Allen', email: 'alen@gmail.com', doB: '1993-1-15' },
        { name: 'Benard', email: 'ben@gmail.com', doB: '1991-4-19' }
    ];
    beforeEach(testing_1.async(function () {
        config = {
            database: 'test',
            version: 1,
            onUpgradeNeeded: function (_db) {
                var objectStore = _db.createObjectStore("users", { keyPath: "email" });
                // create indecies
                objectStore.createIndex("name", "name", { unique: false });
                objectStore.createIndex("email", "email", { unique: true });
                objectStore.createIndex("doB", "doB", { unique: false });
                return _db;
            }
        };
        service = new idb_service_1.IDBService(config);
    }));
    // wipeout the database
    /*afterEach(async(() => {
        service._init_().then(db => {
            db.deleteObjectStore("users");
        })
    }));*/
    it('should accept configurations from config object', function () {
        expect(service.database).toBe(config.database);
        expect(service.version).toBe(config.version);
    });
    it('should connect to the indexed databasen', function (done) {
        service._init_().then(function (db) {
            expect(db).toBeDefined();
            done();
        });
    });
    it('should throw an exception when non positive version is supplied', function (done) {
        service.version = -2;
        service._init_().catch(function (err) {
            expect(err).toBeDefined();
            done();
        });
    });
    it('should call onUpgradeNeeded() & onVersionChange() when new database is created', function (done) {
        config.onUpgradeNeeded = function (db) {
            return db;
        };
        config.onVersionChange = function (db) {
            return true;
        };
        config.database = 'somedatabase';
        config.version = (new Date()).getTime();
        var spyA = spyOn(config, "onUpgradeNeeded").and.returnValue(Promise.resolve("invoked"));
        var spyB = spyOn(config, 'onVersionChange').and.returnValue(true);
        service = new idb_service_1.IDBService(config);
        service._init_().then(function (db) {
            expect(spyA.calls.any()).toBe(true);
            expect(spyB.calls.any()).toBe(true);
            done();
        });
    });
    it('should throw an error when accessing an unknown object store', function (done) {
        var promise = service.getObjects('xaldsa', 'sodaodis');
        promise.catch(function (err) {
            expect(err).toBeDefined();
            done();
        });
    });
    it('when #onVersionChange() returns false, #onUpgradeNeeded should not be invoked', function (done) {
        config.onUpgradeNeeded = function (db) {
            return db;
        };
        config.onVersionChange = function (db) {
            return false;
        };
        config.database = 'someotherdatabase';
        config.version = (new Date()).getTime();
        var spyA = spyOn(config, "onUpgradeNeeded");
        var spyB = spyOn(config, 'onVersionChange');
        service = new idb_service_1.IDBService(config);
        service._init_().then(function (db) {
            expect(spyB.calls.any()).toBe(true);
            expect(spyA.calls.any()).toBe(false);
            done();
        });
    });
    it('#storeObjects() should store new objects', function (done) {
        service.clearStore("users").then(function (_) {
            return service.storeObjects('users', objects);
        }).then(function (users) {
            expect(users.length).toBe(objects.length);
            done();
        });
    });
    it('#storeObjects() should reject storing object with redundant keys', function (done) {
        objects[1].email = objects[0].email;
        service.storeObjects('users', objects).catch(function (err) {
            expect(err).toBeDefined();
            done();
        });
    });
    it('#getObjects() should fetch objects that match the criteria', function (done) {
        service.getObjects(['users'], 'users')
            .then(function (users) {
            expect(users.length).toBe(objects.length);
            return service
                .getObjects(['users'], 'users', IDBKeyRange.only(objects[0].email));
        }).then(function (users) {
            expect(users.length).toBe(1);
            done();
        });
    });
    it('#getObjectsByIndex() should fetch indexed objects', function (done) {
        var keys = [IDBKeyRange.only("Mose"), IDBKeyRange.only("Ben")];
        service.getObjectsByIndex(["users"], "users", "name", IDBKeyRange.only(objects[0].name))
            .then(function (users) {
            expect(users.length).toBe(1);
            done();
        });
    });
    it('#removeObjectsByIndex() should remove indexed objects', function (done) {
        service.removeObjectsByKey(["users"], "users", IDBKeyRange.only(objects[0].email))
            .then(function (_) {
            return service.getObjects(["users"], "users");
        })
            .then(function (users) {
            expect(users.length).toBe(objects.length - 1);
            done();
        });
    });
    it('#replaceObjectByKey() should replace object', function (done) {
        service.replaceObjectByKey('users', objects[0].email, {
            'name': 'Solo', 'email': 'solo@gmail.com', dOB: '1984-7-10'
        })
            .then(function (user) {
            expect(user.name).toBe('Solo');
            done();
        });
    });
    it('#updateObjectsByIndex() should update matching objects', function (done) {
        service.updateObjectsByIndex('users', 'name', 'Benard', [
            { name: 'name', value: 'Benhard' },
            { name: 'doB', value: '1990-1-1' }
        ]).then(function (updated) {
            expect(updated[0].name).toBe('Benhard');
            expect(updated[0].doB).toBe('1990-1-1');
            done();
        });
    });
});
//# sourceMappingURL=idb.service.spec.js.map