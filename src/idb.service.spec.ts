import {async, fakeAsync, tick} from '@angular/core/testing';

import {IDBService, IDBServiceConfig} from './idb.service';

/* isolated test... no angular testing utils */
describe('IDBService', () => {

	let config: IDBServiceConfig;
	let service: IDBService;

	const objects = [
		{name: 'Moses', email: 'kbng.moses@gmail.com', doB: '1989-7-29'},
		{name: 'Allen',  email: 'alen@gmail.com', doB: '1993-1-15'},
		{name: 'Benard', email: 'ben@gmail.com', doB: '1991-4-19'}
	];

	beforeEach(async(() => {
		config = {
			database: 'test',
			version: 1,
			onUpgradeNeeded: (_db: IDBDatabase) => {

				const objectStore = _db.createObjectStore("users", {keyPath: "email"});

				// create indecies
				objectStore.createIndex("name", "name", {unique: false});
				objectStore.createIndex("email", "email", {unique: true});
				objectStore.createIndex("doB", "doB", {unique: false});

				return _db;
			}
		};

		service = new IDBService(config);
	}));

	// wipeout the database
	/*afterEach(async(() => {
		service._init_().then(db => {
			db.deleteObjectStore("users");
		})
	}));*/

	it ('should accept configurations from config object', () => {
		expect(service.database).toBe(config.database);
		expect(service.version).toBe(config.version);
	});

	it ('should connect to the indexed databasen', (done) => {
		service._init_().then(db => {
			expect(db).toBeDefined();
			done();
		});
	});

	it('should throw an exception when non positive version is supplied', done => {
		service.version = -2;
		service._init_().catch(err => {
			expect(err).toBeDefined();
			done();
		});
	});

	it('should call onUpgradeNeeded() & onVersionChange() when new database is created', (done) => {
		config.onUpgradeNeeded = (db) => {
			return db;
		};
		config.onVersionChange = (db) => {
			return true;
		};
		config.database = 'somedatabase';
		config.version  = (new Date()).getTime();
		const spyA = spyOn(config, "onUpgradeNeeded").and.returnValue(Promise.resolve("invoked"));
		const spyB = spyOn(config, 'onVersionChange').and.returnValue(true);
		service = new IDBService(config);
		service._init_().then(db => {
			expect(spyA.calls.any()).toBe(true);
			expect(spyB.calls.any()).toBe(true);
			done();
		});
	});

	it('should throw an error when accessing an unknown object store', (done) => {
		const promise = service.getObjects('xaldsa', 'sodaodis');
		promise.catch(err => {
			expect(err).toBeDefined();
			done();
		})
	});


	it ('when #onVersionChange() returns false, #onUpgradeNeeded should not be invoked', (done) => {
		
		config.onUpgradeNeeded = (db) => {
			return db;
		};

		config.onVersionChange = (db) => {
			return false;
		};

		config.database = 'someotherdatabase';
		config.version  = (new Date()).getTime();
		const spyA = spyOn(config, "onUpgradeNeeded");
		const spyB = spyOn(config, 'onVersionChange');
		service = new IDBService(config);
		service._init_().then(db => {
			expect(spyB.calls.any()).toBe(true);
			expect(spyA.calls.any()).toBe(false);
			done();
		});
	});

	it ('#storeObjects() should store new objects', (done) => {
		service.clearStore("users").then(_ => {
			return service.storeObjects('users', objects);
		}).then(users => {
			expect(users.length).toBe(objects.length);
			done();
		});
	});

	it ('#storeObjects() should reject storing object with redundant keys', (done) => {
		objects[1].email = objects[0].email;
		service.storeObjects('users', objects).catch(err => {
			expect(err).toBeDefined();
			done();
		});
	});

	it ('#getObjects() should fetch objects that match the criteria', (done) => {
		service.getObjects(['users'], 'users')
		.then(users => {
			expect(users.length).toBe(objects.length);
			return service
				.getObjects(['users'], 'users', IDBKeyRange.only(objects[0].email));
		}).then(users => {
			expect(users.length).toBe(1);
			done();
		});
	});

	it ('#getObjectsByIndex() should fetch indexed objects', (done) => {
		const keys = [IDBKeyRange.only("Mose"), IDBKeyRange.only("Ben")];
		service.getObjectsByIndex(
			["users"], "users", "name", IDBKeyRange.only(objects[0].name))
			.then(users => {
				expect(users.length).toBe(1);
				done();
			});
	});

	it ('#removeObjectsByIndex() should remove indexed objects', done => {
		service.removeObjectsByKey(
			["users"], "users", IDBKeyRange.only(objects[0].email))
		.then(_ => {
			return service.getObjects(["users"], "users");
		})
		.then(users => {
			expect(users.length).toBe(objects.length - 1);
			done();
		});
	});

	it ('#replaceObjectByKey() should replace object', done => {
		service.replaceObjectByKey('users', objects[0].email, {
			'name': 'Solo', 'email': 'solo@gmail.com', dOB: '1984-7-10'
		})
		.then(user => {
			expect(user.name).toBe('Solo');
			done();
		});
	});

	it ('#updateObjectsByIndex() should update matching objects', done => {
		service.updateObjectsByIndex('users', 'name', 'Benard', [
				{ name: 'name', value: 'Benhard' },
				{ name: 'doB',  value: '1990-1-1' }
			]).then((updated: any) => {
				expect(updated[0].name).toBe('Benhard');
				expect(updated[0].doB).toBe('1990-1-1');
				done();
			});
		});
});