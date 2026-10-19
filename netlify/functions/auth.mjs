import {accountAuth} from '../../account-runtime.mjs';
export const config={path:'/api/auth/*'};
export default accountAuth.handle;
