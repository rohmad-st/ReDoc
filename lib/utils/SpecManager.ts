'use strict';

import JsonSchemaRefParser from 'json-schema-ref-parser';
import JsonPointer from './JsonPointer';
import { renderMd, safePush } from './helpers';
import slugify from 'slugify';
import { parse as urlParse } from 'url';

export class SpecManager {
  public _schema: any = {};
  public apiUrl: string;
  private _instance: any;
  private _url: string;

  static instance() {
    return new SpecManager();
  }

  constructor() {
    if (SpecManager.prototype._instance) {
      return SpecManager.prototype._instance;
    }

    SpecManager.prototype._instance = this;
  }

  load(url) {
    let promise = new Promise((resolve, reject) => {
      this._schema = {};

      JsonSchemaRefParser.bundle(url, {http: {withCredentials: false}})
      .then(schema => {
          this._url = url;
          this._schema = schema;
          this.init();
          return resolve(this._schema);
      }, err => reject(err));
    });

    return promise;
  }

  /* calculate common used values */
  init() {
    let urlParts = this._url ? urlParse(this._url) : {};
    let schemes = this._schema.schemes;
    let protocol;
    if (!schemes || !schemes.length) {
      // url parser incudles ':' in protocol so remove it
      protocol = urlParts.protocol ? urlParts.protocol.slice(0, -1) : 'http';
    } else {
      protocol = schemes[0];
      if (protocol === 'http' && schemes.indexOf('https') >= 0) {
        protocol = 'https';
      }
    }

    let host = this._schema.host || urlParts.host;
    this.apiUrl = protocol + '://' + host + this._schema.basePath;
    if (this.apiUrl.endsWith('/')) {
      this.apiUrl = this.apiUrl.substr(0, this.apiUrl.length - 1);
    }

    this.preprocess();
  }

  preprocess() {
    this._schema.info['x-redoc-html-description'] = renderMd( this._schema.info.description, {
      open: (tokens, idx) => {
        let content = tokens[idx + 1].content;
        safePush(this._schema.info, 'x-redoc-markdown-headers', content);
        content = slugify(content);
        return `<h${tokens[idx].hLevel} section="section/${content}">` +
          `<a class="share-link" href="#section/${content}"></a>`;
      },
      close: (tokens, idx) => {
        return `</h${tokens[idx].hLevel}>`;
      }
      });
  }

  get schema() {
    return this._schema;
  }

  byPointer(pointer) {
    let res = null;
    try {
      res = JsonPointer.get(this._schema, decodeURIComponent(pointer));
    } catch(e)  {/*skip*/ }
    return res;
  }

  resolveRefs(obj) {
    Object.keys(obj).forEach(key => {
      if (obj[key].$ref) {
        let resolved = this.byPointer(obj[key].$ref);
        resolved._pointer = obj[key].$ref;
        obj[key] = resolved;
      }
    });
    return obj;
  }

  getMethodParams(methodPtr, resolveRefs) {
    /* inject JsonPointer into array elements */
    function injectPointers(array, root) {
      if (!Array.isArray(array)) {
        throw new Error(`parameters must be an array. Got ${typeof array} at ${root}`);
      }
      return array.map((element, idx) => {
        element._pointer = JsonPointer.join(root, idx);
        return element;
      });
    }

    // accept pointer directly to parameters as well
    if (JsonPointer.baseName(methodPtr) === 'parameters') {
      methodPtr = JsonPointer.dirName(methodPtr);
    }

    //get path params
    let pathParamsPtr = JsonPointer.join(JsonPointer.dirName(methodPtr), ['parameters']);
    let pathParams = this.byPointer(pathParamsPtr) || [];

    let methodParamsPtr = JsonPointer.join(methodPtr, ['parameters']);
    let methodParams = this.byPointer(methodParamsPtr) || [];
    pathParams = injectPointers(pathParams, pathParamsPtr);
    methodParams = injectPointers(methodParams, methodParamsPtr);

    if (resolveRefs) {
      methodParams = this.resolveRefs(methodParams);
      pathParams = this.resolveRefs(pathParams);
    }
    return methodParams.concat(pathParams);
  }

  getTagsMap() {
    let tags = this._schema.tags || [];
    var tagsMap = {};
    for (let tag of tags) {
      tagsMap[tag.name] = {
        description: tag.description,
        'x-traitTag': tag['x-traitTag'] || false
      };
    }

    return tagsMap;
  }

  findDerivedDefinitions(defPointer) {
    let definition = this.byPointer(defPointer);
    if (!definition) throw new Error(`Can't load schema at ${defPointer}`);
    if (!definition.discriminator) return [];

    let globalDefs = this._schema.definitions || {};
    let res = [];
    for (let defName of Object.keys(globalDefs)) {
      if (!globalDefs[defName].allOf &&
        !globalDefs[defName]['x-derived-from']) continue;
      let subTypes = globalDefs[defName]['x-derived-from'] ||
        globalDefs[defName].allOf.map(subType => subType._pointer || subType.$ref);
      let idx = subTypes.findIndex(ref => ref === defPointer);
      if (idx < 0) continue;

      let empty = false;
      if (subTypes.length === 1) {
        empty = true;
      }
      res.push({name: defName, $ref: `#/definitions/${defName}`, empty});
    }
    return res;
  }

}
