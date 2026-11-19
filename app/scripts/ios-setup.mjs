// cap add ios 뒤에 한 번 실행: 세로 고정·상태바 숨김·암호화 신고 면제·업로드 설정 파일.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = join(app, 'ios', 'App', 'App', 'Info.plist');
let p = readFileSync(plistPath, 'utf8');

function setKey(key, xml) {
  const re = new RegExp(`\\s*<key>${key}</key>\\s*(<array>[\\s\\S]*?</array>|<[^>]+/>|<string>[^<]*</string>)`);
  p = p.replace(re, '');
  p = p.replace(/<dict>/, `<dict>\n\t<key>${key}</key>\n\t${xml}`);
}
setKey('UISupportedInterfaceOrientations', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
setKey('UISupportedInterfaceOrientations~ipad', '<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t\t<string>UIInterfaceOrientationPortraitUpsideDown</string>\n\t</array>');
setKey('UIStatusBarHidden', '<true/>');
setKey('UIViewControllerBasedStatusBarAppearance', '<false/>');
setKey('UIRequiresFullScreen', '<true/>');
setKey('ITSAppUsesNonExemptEncryption', '<false/>');
writeFileSync(plistPath, p);

writeFileSync(join(app, 'ios', 'ExportOptions.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>method</key>
\t<string>app-store-connect</string>
\t<key>destination</key>
\t<string>upload</string>
\t<key>teamID</key>
\t<string>TEAM_ID_PLACEHOLDER</string>
\t<key>signingStyle</key>
\t<string>automatic</string>
\t<key>manageAppVersionAndBuildNumber</key>
\t<false/>
</dict>
</plist>
`);
console.log('iOS Info.plist and ExportOptions.plist updated');
