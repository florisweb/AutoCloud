import fs from 'fs';
import { readdir } from 'node:fs/promises'
import Client from 'ssh2-sftp-client';
const MaxDepthReachedFolder = 'E_maxDepthReached'; //Symbol('E_maxDepthReached');
import FolderIndex from './folderIndex.js';


export default class FileServer {
  #CachedIndexFileName = 'AutoCloud_remoteCache.json';

  client;
  #config = {};
  #isSetup = false;
  index;

  #connected = false;
  get isConnected() {
    return this.#isSetup && this.#connected;
  }

  constructor(_config) {
    this.#config = _config;
    this.client = new Client();
  }

  async setup() {
    if (await this.#readCachedIndex()) return this.#isSetup = true;
    if (!(await this.connect())) return;
    this.#isSetup = true;
    this.index = await this.generateIndex();
    await this.disconnect();
  }

  async connect() {
    if (this.#connected) return;
    try {
      console.log('Connecting...');
      await this.client.connect(this.#config.server);
    } catch (err) {
      console.log('Failed to connect:', err);
      this.#connected = false;
      await wait(15000);
      return await this.connect();
    }
    console.log('Connected');
    this.#connected = true;
    return true;
  }

  async disconnect() {
    if (!this.#connected) return;
    this.#connected = false;
    console.log('Disconnected');
    return await this.client.end();
  }
  async listRootFiles() {
    return await this.client.list(this.#config.server.remoteFolder);
  }

  async writeCachedIndex() {
    return new Promise((resolve => {
      let path = this.#config.CacheFolder + '/' + this.#CachedIndexFileName;
      let data = this.index.export();
      fs.writeFile(path, JSON.stringify(data), (err) => {
        if (err) 
        {
          console.log('error while writing', err);
          resolve(false);
        } return resolve(true);
      })

    }));
  }

  async #readCachedIndex() {
    let path = this.#config.CacheFolder + '/' + this.#CachedIndexFileName;
    if (!fs.existsSync(path)) return false;
    try {
      let data = fs.readFileSync(path);
      let obj = JSON.parse(data);
      if (!this.index) this.index = new FolderIndex();
      this.index.import(obj);
    } catch(e) {
      console.log('error', e);
      return false;
    }
    return true;
  }

  async uploadFolder(_name, _watchedFolder = false) {
    let fullPath = _name.split(_watchedFolder).length > 0 ? _name : _watchedFolder + '/' + _name;
    if (!fs.existsSync(fullPath)) return console.log('Error, source file does not exist:', _name);
    console.log('[FS] upload folder:', fullPath);

    let contents = await this.#readLocalDir(fullPath);
    for (let item of contents)
    {
      if (!item.isFolder)
      {
        await this.uploadFile(fullPath + '/' + item.name, _watchedFolder);
        continue;
      } else {
        await this.uploadFolder(fullPath + '/' + item.name, _watchedFolder)
      }
    }
  }

  async #readLocalDir(_path) {
     return (await readdir(_path))
      // .filter(r => !this.#parent._isPathInIgnoreFolder(_path + '/' + r)) // TODO
      .map(r => {
        let fullPath = _path + '/' + r;
        let stat = fs.lstatSync(fullPath);
        return {
          name: r,
          fullPath: fullPath, 
          stat: stat, 
          isFolder: stat.isDirectory(), 
          size: stat.size}
      }
    );
  }
  


  async uploadFile(_name, _watchedFolder = false) {
    let fullPath = _name.split(_watchedFolder).length > 0 ? _name : _watchedFolder + '/' + _name;
    let localName = _name.split(_watchedFolder).length > 1 ? _name.split(_watchedFolder)[1] : _name;
    if (!fs.existsSync(fullPath)) return console.log('Error, source file does not exist:', _name);
    console.log('[FS] upload file:', fullPath);
    let targetPath = this.#config.server.remoteFolder + '/' + localName;
    let parts = targetPath.split('/');
    let pathPath = parts.splice(0, parts.length - 1).join('/');
    let stat = fs.lstatSync(fullPath);
    
    try {
      let exists = await this.client.exists(pathPath);
      if (!exists) await this.client.mkdir(pathPath, true);
      return this.client.put(fullPath, targetPath).then(() => {
        // Success: update index
        this.index.addFile(localName, stat.size);
      });
    } catch (e) {
      console.log('! [FS] Error while uploading:', _name, e)
      return false;
    }
  }

  async renameOrMove(_fromPath, _toPath) {
    let remoteFromPath = this.#config.server.remoteFolder + '/' + _fromPath;
    let remoteToPath = this.#config.server.remoteFolder + '/' + _toPath;
    
    let parts = remoteToPath.split('/');
    let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    let exists = await this.client.exists(pathPath);
    if (!exists) await this.client.mkdir(pathPath, true);
    return await this.client.rename(remoteFromPath, remoteToPath);
  }



  async isFolder(_name) {
    let parts = _name.split('/');
    let sanitizedPath = parts.filter(r => !!r).join('/');
    let targetPath = this.#config.server.remoteFolder + '/' + sanitizedPath;
    let stat = await this.client.stat(targetPath);
    return stat.isDirectory;
  }

  async removeFile(_name) {
    let parts = _name.split('/');
    let sanitizedPath = parts.filter(r => !!r).join('/');
    let targetPath = this.#config.server.remoteFolder + '/' + sanitizedPath;
    
    return this.client.delete(targetPath).then(() => {
      this.index.removePath(sanitizedPath);
    });
  }

  async removeFolder(_name) {
    let parts = _name.split('/');
    let sanitizedPath = parts.filter(r => !!r).join('/');
    let targetPath = this.#config.server.remoteFolder + '/' + sanitizedPath;
    
    return this.client.rmdir(targetPath, true).then(() => {
      this.index.removePath(sanitizedPath);
    });
  }




  async generateIndex() { 
    let map = new FolderIndex(this.#config.server.remoteFolder);
    let This = this;

    async function generateIndex(_folder, _depth) {
      if (_depth < 0) return MaxDepthReachedFolder;
      let fileObjs = await This.client.list(_folder);
      let promises = [];
      for (let fileObj of fileObjs)
      {
        if (fileObj.type === 'd') // Directory
        {
          promises.push(generateIndex(_folder + '/' + fileObj.name, _depth - 1));
          continue;
        }

        map.addFile(_folder + '/' + fileObj.name, fileObj.size);
      }
      await Promise.all(promises);
    }

    await generateIndex(this.#config.server.remoteFolder, this.#config.MaxDepth);
    return map;
  }
}


async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}