import path from 'node:path';
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.env.BLENDER||'D:/SteamLibrary/steamapps/common/Blender/blender.exe',['-b','--factory-startup','--python-exit-code','1','-P',path.join(import.meta.dirname,'split-part.py'),'--',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
if(result.error)throw result.error;process.exitCode=result.status??1;
