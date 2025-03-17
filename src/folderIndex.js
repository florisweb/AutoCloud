
export default class FolderIndex {
  #index = {
    contents: [],
    needsUpdate: false,
  };
  get index() {
    return this.#index;
  }

  #basePath = false;
  constructor(_basePath = false) {
    this.#basePath = _basePath;
  }
  import({index, basePath}) {
    this.#index = _index;
    this.#basePath = basePath;
  }


  addFile(_path, _size) { // Path obj
    let localPath = this.#pathToLocalPath(_path);
    let parts = localPath.split('/').filter(p => !!p);
    let fileName = Object.assign([], parts).pop();
    let folderPath = Object.assign([], parts).splice(0, parts.length - 1).join('/');
    let folder = this.addFolder(folderPath); // Make sure the folder exists

    folder.contents[fileName] = {size: _size};
  }

  addFolder(_path) { // Path obj
    let localPath = this.#pathToLocalPath(_path);
    let parts = localPath.split('/').filter(p => !!p)
    let curFolder = this.#index;

    for (let part of parts)
    {
      if (!curFolder.contents[part]) 
      {
        curFolder.contents[part] = {
          contents: [],
          needsUpdate: false,
        }
      }
      curFolder = curFolder.contents[part];
    }
    return curFolder;
  }

  difference(_folderIndex, _changedPerspective = false) {
    let missingPaths = [];

    function recursiveLoop(_indexA, _indexB, _curPath = '') {
      for (let key in _indexA.contents)
      {
        let curPath = _curPath + '/' + key;
        let found = Object.keys(_indexB.contents).includes(key);
        if (!found)
        {
          missingPaths.push(curPath);
          continue;
        }

        let isFile = typeof _indexA.contents[key].contents === 'undefined';
        let otherIsFile = typeof _indexB.contents[key].contents === 'undefined';
        if (isFile !== otherIsFile) 
        {
          missingPaths.push(curPath);
          continue;
        }

        if (!isFile) return recursiveLoop(_indexA.contents[key], _indexB.contents[key], curPath);
        if (_indexA.contents[key].size === _indexB.contents[key].size) continue;
        missingPaths.push(curPath);
      }
    }

    recursiveLoop(this.#index, _folderIndex.index);
    
    if (_changedPerspective) return missingPaths;
    return {
      missingPaths: missingPaths,
      extraPaths: _folderIndex.difference(this, true)
    }
  }



  copy() {
    let index = new FolderIndex();
    index.import({index: JSON.parse(JSON.stringify(this.#index)), basePath: this.#basePath});
    return index;
  }



  #getFolderFromPath(_path) {
    let localPath = this.#pathToLocalPath(_path);
    let parts = localPath.split('/').splice(1, Infinity);
    
    let curFolder = this.#index;
    for (let part of parts)
    {
      if (!curFolder.contents[part]) return false;
      curFolder = curFolder.contents[part];
    }
    return curFolder;
  }


  #pathToLocalPath(_path) {
    let parts = _path.split(this.#basePath);
    return parts.length > 1 ? parts[1] : parts[0];
  }


  print(_compact = true) {
    const Indent = `   `;
    return createStr(this.#index, 'root', 0).join('\n');

    function createStr(_folder, _folderName) {
      let contentStrings = [];
      for (let content in _folder.contents)
      {
        if (typeof _folder.contents[content].contents === 'undefined')
        {
          contentStrings.push(Indent + Indent + content + ': {size: ' + _folder.contents[content].size + '}');
        } else {
          contentStrings = contentStrings.concat(createStr(_folder.contents[content], content).map(r => Indent + Indent + r));
        }
      }

      if (_compact)
      {
        return [
          _folderName + ` [${_folder.needsUpdate ? 1 : 0}]: [`,
          ...contentStrings,
          `}`
        ];
      }
      return [
        _folderName + `: {`,
        Indent + `needsUpdate: ${_folder.needsUpdate},`,
        Indent + `contents: [`,
        ...contentStrings,
        Indent + `]`,
        `}`
      ];
    }

  }
}