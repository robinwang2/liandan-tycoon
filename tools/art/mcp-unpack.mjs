// 第 8 批 MCP 原件使用 glTF 的 Y 轴向上；把校正放在父节点，保留各部件的局部变换。
import { writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

async function unpack(input, output) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(input);
  const root = doc.getRoot();
  const meshopt = root.listExtensionsUsed().find(ext => ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME);
  if (!meshopt) throw Error('请输入 get_model_asset 下载的 meshopt 原件，已转正的模型不能重复处理');
  meshopt.dispose();
  await doc.transform(dequantize());

  for (const scene of root.listScenes()) {
    const children = scene.listChildren();
    const yaw = doc.createNode('yaw').setRotation([0, -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]);
    for (const child of children) yaw.addChild(child);
    scene.addChild(yaw);
  }
  await writeFile(output, await io.writeBinary(doc), { flag: 'wx' });
}

try {
  if (process.argv.length !== 4) throw Error('用法：node tools/art/mcp-unpack.mjs <MCP 原件.glb> <新输出.glb>');
  await unpack(...process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
