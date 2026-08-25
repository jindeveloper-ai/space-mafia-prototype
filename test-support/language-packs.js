import en from "../locales/en.js";
import es419 from "../locales/es-419.js";
import ja from "../locales/ja.js";
import ko from "../locales/ko.js";
import yueHantHK from "../locales/yue-Hant-HK.js";
import zhCN from "../locales/zh-CN.js";
import zhTW from "../locales/zh-TW.js";
import { registerLanguagePack } from "../i18n.js";


registerLanguagePack("ko", ko);
registerLanguagePack("en", en);
registerLanguagePack("ja", ja);
registerLanguagePack("zh-CN", zhCN);
registerLanguagePack("zh-TW", zhTW);
registerLanguagePack("yue-Hant-HK", yueHantHK);
registerLanguagePack("es-419", es419);
