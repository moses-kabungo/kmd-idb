import { ModuleWithProviders, NgModule } from '@angular/core';
import { IDBService
	   , IDBServiceConfig
	   , IDB_DI_CONFIG                } from './idb.service';

@NgModule({})
export class IDBModule {

	/*
	 * It helps us to pre-configure the IDBService
	 */
	static forRoot(config: IDBServiceConfig): ModuleWithProviders {
		return {
			ngModule: IDBModule,
			providers: [
				{provide: IDB_DI_CONFIG, useValue: config}
			]
		};
	} 
}