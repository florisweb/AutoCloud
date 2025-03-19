import fs from 'fs';
import { readdir } from 'node:fs/promises'
import Client from 'ssh2-sftp-client';
const MaxDepthReachedFolder = 'E_maxDepthReached'; //Symbol('E_maxDepthReached');
import FolderIndex from './folderIndex.js';


export default class FileServer {
  #CachedIndexFileName = 'AutoCloud_remoteCache.json';

  #folderManagers = [];
  client;
  config = {};
  #isSetup = false;
  index;



  #connected = false;
  get isConnected() {
    return this.#isSetup && this.#connected;
  }

  constructor(_config) {
    this.config = _config;
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
      await this.client.connect(this.config.server);
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

  async writeCachedIndex() {
    return new Promise((resolve => {
      let path = this.config.CacheFolder + '/' + this.#CachedIndexFileName;
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
    let path = this.config.CacheFolder + '/' + this.#CachedIndexFileName;
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


  setFolderTrackers(_localTrackers) {
    this.#folderManagers = _localTrackers.map(r => new RemoteFolderManager(r, this));
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



  async uploadFile(_localPath, _remoteRelPath) {
    if (!fs.existsSync(_localPath)) return console.log('Error, source file does not exist:', _localPath);
    console.log('[FS] uploading file:', _localPath);
    let remoteAbsPath = this.config.server.remoteFolder + '/' + _remoteRelPath;
    let parts = remoteAbsPath.split('/');
    let remoteContainingFolder = parts.splice(0, parts.length - 1).join('/');
    try {
      await this.#createFolderIfAbsent(remoteContainingFolder);
      let stat = fs.lstatSync(_localPath);
      return this.client.put(_localPath, remoteAbsPath).then(() => {
        // Success: update index
        this.index.addFile(_remoteRelPath, stat.size);
      });
    } catch (e) {
      console.log('! [FS] Error while uploading:', _localPath, e)
      return false;
    }
  }

  async #createFolderIfAbsent(_remoteAbsPath) {
    let exists = await this.client.exists(_remoteAbsPath);
    if (!exists) await this.client.mkdir(_remoteAbsPath, true);
  }


  async uploadFolder(_localPath, _remoteRelPath) {
    if (!fs.existsSync(_localPath)) return console.log('Error, source file does not exist:', _localPath);
    console.log('[FS] uploading folder:', _localPath);
    let remoteAbsPath = this.config.server.remoteFolder + '/' + _remoteRelPath;

    let contents = await this.#readLocalDir(_localPath);
    for (let item of contents)
    {
      if (!item.isFolder)
      {
        await this.uploadFile(_localPath + '/' + item.name, _remoteRelPath + '/' + item.name);
        continue;
      } else {
        await this.uploadFolder(_localPath + '/' + item.name, _remoteRelPath + '/' + item.name);
      }
    }
  }


  async removeFile(_remoteRelPath) {
    let remoteAbsPath = this.config.server.remoteFolder + '/' + _remoteRelPath;
    console.log('[FS] remove file:', _remoteRelPath);
    return this.client.delete(remoteAbsPath).then(() => {
      this.index.removePath(_remoteRelPath);
    });
  }


  async removeFolder(_remoteRelPath) {
    let remoteAbsPath = this.config.server.remoteFolder + '/' + _remoteRelPath;
    console.log('[FS] remove folder:', _remoteRelPath);
    return this.client.rmdir(remoteAbsPath, true).then(() => {
      this.index.removePath(_remoteRelPath);
    });
  }




  async generateIndex() { 
    let map = new FolderIndex(this.config.server.remoteFolder);
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

    await generateIndex(this.config.server.remoteFolder, this.config.MaxDepth);
    return map;
  }
}







class RemoteFolderManager {
  #localTracker;
  #server;

  get remoteRelPath() {
    return this.#localTracker.remotePath;
  }

  constructor(_localTracker, _parent) {
    this.#server = _parent;
    this.#localTracker = _localTracker;
    this.#localTracker.server = this;
  }


  async isFolder(_path) {
    let targetPath = this.#server.config.server.remoteFolder + '/' + this.remoteRelPath + '/' + this.#sanatizePath(_path);
    let stat = await this.#server.client.stat(targetPath);
    return stat.isDirectory;
  }

  async uploadFile(_relativePath) {
    let fullPath = _relativePath.split(this.#localTracker.folderPath).length > 1 ? _relativePath : this.#localTracker.folderPath + '/' + _relativePath;
    let localPath = fullPath.split(this.#localTracker.folderPath)[1];
    return this.#server.uploadFile(fullPath, this.remoteRelPath + '/' + localPath);
  }

  async uploadFolder(_relativePath) {
    let fullPath = _relativePath.split(this.#localTracker.folderPath).length > 1 ? _relativePath : this.#localTracker.folderPath + '/' + _relativePath;
    let localPath = fullPath.split(this.#localTracker.folderPath)[1];
    return this.#server.uploadFolder(fullPath, this.remoteRelPath + '/' + localPath);
  }

  async removeFile(_relativePath) {
    let localPath = _relativePath.split(this.#localTracker.folderPath).length > 1 ? _relativePath.split(this.#localTracker.folderPath)[1] : _relativePath;
    return this.#server.removeFile(this.remoteRelPath + '/' + localPath);
  }

  async removeFolder(_relativePath) {
    let localPath = _relativePath.split(this.#localTracker.folderPath).length > 1 ? _relativePath.split(this.#localTracker.folderPath)[1] : _relativePath;
    return this.#server.removeFolder(this.remoteRelPath + '/' + localPath);
  }


  #sanatizePath(_path) {
    return _path.split('/').filter(r => !!r).join('/');
  }
}







async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}