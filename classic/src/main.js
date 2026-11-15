import './style.css';
import './pdx.css';
import './extra.css';
import { createOffice } from './scene/office.js';
import { boot } from './ui/ui.js';

// 3D 场景起不来（比如显卡驱动不支持 WebGL）也不影响玩：退化成纯界面
let office;
try {
  office = createOffice(document.getElementById('scene'));
} catch (err) {
  console.error('3D 场景初始化失败，改用纯界面模式', err);
  office = { sync() {}, play() {}, setInsets() {}, dispose() {} };
}
boot(document.getElementById('ui'), office);
