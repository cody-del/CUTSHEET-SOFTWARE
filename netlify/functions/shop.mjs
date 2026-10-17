import {Pool} from 'pg';
import {postgresStore} from '../../shop-store.mjs';
import {createShopService} from '../../shop-service.mjs';
import {shopHandler} from '../../shop-api.mjs';
import {databaseOptions} from '../../shop-database.mjs';

export const config={path:'/api/shop/*'};
const options=databaseOptions();
const pool=options?new Pool(options):null;
pool?.on('error',()=>{}); // Request handlers report a safe, actionable connection error.
export default shopHandler(createShopService({store:pool?postgresStore(pool):null,
  publicOwnerAccess:process.env.CUTSHEET_PUBLIC_OWNER_ACCESS==='true',
  password:process.env.CUTSHEET_OWNER_PASSWORD,secret:process.env.CUTSHEET_SESSION_SECRET}));
