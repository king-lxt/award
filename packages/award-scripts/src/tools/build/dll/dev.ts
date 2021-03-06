/**
 * 处理dll文件
 * 默认会缓存在根目录的.dll下
 * 同时每次取值会做hash判断文件是否发生变更，来决定是否重新编译dll资源
 *
  new webpack.DllReferencePlugin({
    context: '.',
    manifest: require(path.join(dir, '.dll/manifest.json'))
  })
 */
import chalk = require('chalk');
import md5 = require('md5');
import * as path from 'path';
import * as fs from 'fs-extra';
import ProdCompiler from '../utils/prod.compiler';
import webpackCompiler from '../utils/webpack.compiler';
import Config from './webpack.dev.config';

export default (dir: string, assetPrefixs: string) => {
  if (!fs.existsSync(path.join(dir, 'node_modules/award/package.json'))) {
    return Promise.resolve();
  }
  const dllDir = path.join(dir, 'node_modules', '.dll');
  const pkg = path.join(dir, 'package.json');
  const awardConfig = path.join(dir, 'award.config.js');
  const commonDll = path.join(dllDir, 'common.js');
  const manifestJson = path.join(dllDir, 'manifest.json');
  const dllLockFile = path.join(dllDir, '.lock');

  let pkgHash = '';
  let awardConfigHash = '';
  if (fs.existsSync(pkg)) {
    pkgHash = md5(String(fs.readFileSync(pkg)));
  }
  if (fs.existsSync(awardConfig)) {
    awardConfigHash = md5(String(fs.readFileSync(awardConfig)));
  }

  return new Promise(async (resolve, reject) => {
    // 判断当前是否在框架测试中
    try {
      /**
       * 获取packages.json的dll参数
       */
      const dll = (require(pkg).dll || []).filter((item: any) => item !== 'award');
      let entryHash = '';
      // 遍历每个entry的版本号
      const entry = [
        ...new Set([
          'react',
          'react-dom',
          'award-plugin',
          'award-router',
          'award-fetch',
          'award-utils',
          'ansi-html',
          'ansi-regex',
          'fast-levenshtein',
          'html-entities',
          'querystring-es3',
          'react-lifecycles-compat',
          'hoist-non-react-statics',
          'react-router-config',
          'strip-ansi',
          '@hot-loader/react-dom',
          'react-helmet',
          'react-loadable',
          ...dll
        ])
      ].map((item: any) => {
        if (/\.\//.test(item)) {
          const fullpath = path.resolve(dir, item);
          entryHash += md5(item + fs.readFileSync(fullpath, 'utf-8'));
          return fullpath;
        } else {
          let version = '';
          try {
            version = require(item + '/package.json').version;
          } catch (error) {
            try {
              version = require(path.join(dir, 'node_modules', item, 'package.json')).version;
            } catch (error) {}
          }
          entryHash += md5(item + version);
          return item;
        }
      });
      const envs = {
        NODE_ENV: JSON.stringify('development'),
        RUN_ENV: JSON.stringify('web'),
        ROUTER: JSON.stringify(process.env.ROUTER)
      };
      const envsStr = JSON.stringify(envs);

      if (
        fs.existsSync(dllDir) &&
        fs.existsSync(commonDll) &&
        fs.existsSync(manifestJson) &&
        fs.existsSync(dllLockFile)
      ) {
        // 验证lock内容是否一致
        const commonDllTime = fs.statSync(commonDll).ctimeMs;
        const manifestJsonTime = fs.statSync(manifestJson).ctimeMs;
        const commonDllHash = md5(fs.readFileSync(commonDll, 'utf-8'));
        const manifestJsonHash = md5(fs.readFileSync(manifestJson, 'utf-8'));
        const currentLock = md5(
          pkgHash +
            awardConfigHash +
            envsStr +
            entryHash +
            commonDllTime +
            manifestJsonTime +
            commonDllHash +
            manifestJsonHash
        );
        const oldLock = fs.readFileSync(dllLockFile, 'utf-8');
        if (currentLock === oldLock) {
          console.info(chalk.green(`检测发现当前dll资源未发生变更，将不再编译`));
          return resolve();
        }
      }

      const config: any = Config(entry, dir, assetPrefixs, envs);
      await ProdCompiler(
        await webpackCompiler(config.webpack, config, {
          isServer: false,
          isAward: false,
          dev: false,
          dir,
          dll: true
        })
      );

      // 创建或者更新lock
      if (fs.existsSync(dllDir) && fs.existsSync(commonDll) && fs.existsSync(manifestJson)) {
        const commonDllTime = fs.statSync(commonDll).ctimeMs;
        const manifestJsonTime = fs.statSync(manifestJson).ctimeMs;
        const commonDllHash = md5(fs.readFileSync(commonDll, 'utf-8'));
        const manifestJsonHash = md5(fs.readFileSync(manifestJson, 'utf-8'));
        const currentLock = md5(
          pkgHash +
            awardConfigHash +
            envsStr +
            entryHash +
            commonDllTime +
            manifestJsonTime +
            commonDllHash +
            manifestJsonHash
        );
        fs.writeFileSync(dllLockFile, currentLock);
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};
