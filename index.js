/*
@license https://github.com/t2ym/gulp-i18n-preprocess/blob/master/LICENSE.md
Copyright (c) 2016, Tetsuya Mori <t2y3141592@gmail.com>. All rights reserved.
*/
'use strict';

var path = require('path');
var fs = require('fs');
var gutil = require('gulp-util');
var through = require('through2');
var dom5 = require('dom5');
var JSONstringify = require('json-stringify-safe');

/**
 * Gulp plugin to preprocess Polymer templates and extract UI strings to JSON for build-time I18N with i18n-behavior
 *
 * @namespace i18n-preprocess
 */
module.exports = function(options) {
  var doPreprocess = function(file, enc, callback) {
    var stream = this;
    var replacingText = options ? !!options.replacingText : false;
    var jsonSpace = (options && options.jsonSpace !== undefined) ? options.jsonSpace : 2;
    var srcPath = (options && options.srcPath !== undefined) ? options.srcPath : 'app';
    var force = options ? !!options.force : false;
    var dropHtml = options ? !!options.dropHtml : false;
    var constructAttributesRepository = options ? options.constructAttributesRepository : false;
    var attributesRepositoryPath = options ? options.attributesRepositoryPath : null;
    var attributesRepositoryTemplates = [];
    var attributesRepository = options ? options.attributesRepository : {};

    if (options && !attributesRepository) {
      options.attributesRepository = attributesRepository;
    }

    if (file.isNull()) {
      return callback(null, file);
    }

    function loadAttributesRepository() {
      var i;
      if (attributesRepositoryPath) {
        if (typeof attributesRepositoryPath === 'string') {
          attributesRepositoryPath = [ attributesRepositoryPath ];
        }
        else if (Array.isArray(attributesRepositoryPath)) {
        }
        else {
          return;
        }
        attributesRepositoryTemplates = [];
        for (i = 0; i < attributesRepositoryPath.length; i++) {
          try {
            var contents = fs.readFileSync(attributesRepositoryPath[i], 'utf8');
            var document = dom5.parse(contents);
            var topTemplate = dom5.query(document, function (node) {
              if (dom5.predicates.hasTagName('dom-module')(node) &&
                  dom5.getAttribute(node, 'id') === 'i18n-attr-repo') {
                return true;
              }
              return false;
            });
            var repositoryTemplate = dom5.query(topTemplate, function (node) {
              if (dom5.predicates.hasTagName('template')(node) &&
                  dom5.getAttribute(node, 'id') === 'standard') {
                return true;
              }
              return false;
            });
            if (repositoryTemplate) {
              attributesRepositoryTemplates.push(repositoryTemplate);
            }
          }
          catch (e) {
          }
        }
        for (i = 0; i < attributesRepositoryTemplates.length; i++) {
          var dummy = [];
          dom5.nodeWalkAll(attributesRepositoryTemplates[i], function (node) {
            var tag, attr, attrValue;
            var i;
            if (dom5.predicates.hasTagName('template')(node) &&
                dom5.getAttribute(node, 'id') === 'standard') {
              // skip template itself
            }
            else {
              tag = node.tagName;
              if (tag) {
                tag = tag.toLowerCase();
                attributesRepository[tag] = attributesRepository[tag] || {};
                if (node.attrs) {
                  for (i = 0; i < node.attrs.length; i++) {
                    attr = node.attrs[i].name;
                    if (attr) {
                      attr = attr.toLowerCase();
                      attrValue = node.attrs[i].value;
                      if (attrValue) {
                        attributesRepository[tag][attr] = attrValue;
                      }
                      else {
                        attributesRepository[tag][attr] = true;
                      }
                    }
                  }
                }
              }
            }
            return false;
          }, dummy);
          //console.log('attributesRepository = ');
          //console.log(JSONstringify(attributesRepository, null, 2));
        }
      }
      return attributesRepository;
    }

    function isLocalizableAttribute(element, attr) {
      if (attributesRepository[element]) {
        return !!attributesRepository[element]['any-attributes'] ||
                !!attributesRepository[element][attr];
      }
      else if (attributesRepository['any-elements'] &&
               attributesRepository['any-elements'][attr]) {
        return true;
      }
      else {
        return false;
      }
    }

    function setLocalizableAttribute(element, attr, value) {
      attributesRepository[element] = attributesRepository[element] || {};
      attributesRepository[element][attr] = value ? value : true;
    }

    // register localizable attributes from template tag
    // format 1: <template text-attr="localizable-attr1 attr2">
    // format 2: <template text-attr localizable-attr1 attr2="value2">
    function registerLocalizableAttributes(element, template) {
      if (!element) {
        element = dom5.getAttribute(template, 'id');
      }
      if (element) {
        var attrs = (dom5.getAttribute(template, 'text-attr') || '').split(' ');
        var textAttr = false;
        attrs.forEach(function (attr) {
          if (attr) {
            setLocalizableAttribute(element, attr, true);
          }
        });
        Array.prototype.forEach.call(template.attrs, function (attr) {
          switch (attr.name) {
          case 'id':
          case 'lang':
          case 'localizable-text':
          case 'assetpath':
            break;
          case 'text-attr':
            textAttr = true;
            break;
          default:
            if (textAttr) {
              setLocalizableAttribute(element, attr.name, attr.value);
            }
            break;
          }
        });
      }
    }

    function embedJson(template, bundle) {
      dom5.setAttribute(template, 'localizable-text', 'embedded');
      var wrapperTemplate = dom5.constructors.element('template');
      var jsonData = dom5.constructors.element('json-data');
      var fragment = dom5.constructors.element('span');
      dom5.setTextContent(jsonData, '\n' + JSONstringify(bundle, null, jsonSpace) + '\n');
      dom5.append(fragment, dom5.constructors.text('\n'));
      dom5.append(fragment, jsonData);
      dom5.append(fragment, dom5.constructors.text('\n'));
      dom5.append(wrapperTemplate, fragment);
      fragment.nodeName = '#document-fragment';
      fragment.tagName = undefined;
      dom5.setAttribute(wrapperTemplate, 'id', 'localizable-text');
      for (var i = 0; i < template.childNodes.length; i++) {
        if (dom5.isDocumentFragment(template.childNodes[i])) {
          dom5.append(template.childNodes[i], wrapperTemplate);
          dom5.append(template.childNodes[i], dom5.constructors.text('\n'));
          break;
        }
      }
    }

    function constructMessageBundle(file, contents, bundles, status) {
      var result;
      var document = dom5.parse(contents);
      var path = [];
      var templates = [];
      var bundle;
      var linkLocalizable;
      var i;

      linkLocalizable = dom5.query(document, function (node) {
        if (dom5.predicates.hasTagName('link')(node) &&
            dom5.getAttribute(node, 'rel') === 'import') {
          var href = dom5.getAttribute(node, 'href');
          if (href.indexOf('/i18n-behavior.html') >= 0) {
            return true;
          }
        }
        return false;
      });

      if (force || linkLocalizable) {
        status.localizable = true;
        loadAttributesRepository();
        dom5.nodeWalkAll(document, function (node) {
          if (dom5.predicates.hasTagName('template')(node)) {
            var is = dom5.getAttribute(node, 'is');
            var parent = node.parentNode;
            var parentTagName = parent && parent.tagName ? 
                                  parent.tagName.toLowerCase() : null;
            if (is === 'i18n-dom-bind') {
              return true;
            }
            switch (parentTagName) {
            case 'dom-module':
            case 'body':
            case 'head':
            case 'html':
              return true;
            default:
              return false;
            }
          }
          else {
            return false;
          }
        }, templates);

        for (i = 0; i < templates.length; i++) {
          bundle = { meta: {}, model: {} };
          path = [];
          var moduleId = dom5.getAttribute(templates[i], 'id');
          if (moduleId) {
            var dirname = file.dirname || file.base.substr(0, -1);
            var assetpath = dirname.substr(file.cwd.length + srcPath.length + 1) + '/';
            //console.log('assetpath = ' + assetpath);
            dom5.setAttribute(templates[i], 'assetpath', assetpath);
          }
          else {
            moduleId = dom5.getAttribute(templates[i].parentNode, 'id');          
          }
          //console.log('module id = ' + moduleId);
          if (constructAttributesRepository) {
            registerLocalizableAttributes(moduleId, templates[i]);
            //console.log(JSONstringify(attributesRepository, null, 2));
          }
          else {
            traverseTemplateTree(templates[i], path, bundle, 0);
            //console.log(JSONstringify(bundle, null, 2));
            bundles[moduleId] = bundle;
            if (replacingText) {
              embedJson(templates[i], bundle);
            }
          }
        }

        /*
        // merge default text into bundle
        this._mergeDefaultText(bundle);
        console.log('text = ');
        console.log(bundle);
        */
        result = constructAttributesRepository ? contents : dom5.serialize(document);
      }
      else {
        status.localizable = false;
        result = contents;
      }

      return result;
    }

    function traverseAttributes(node, path, bundle) {
      var name = node.nodeName.toLowerCase();
      var id = dom5.getAttribute(node, 'text-id') || 
                dom5.getAttribute(node, 'id');
      var text;
      var messageId;
      var attrId;
      // pick up element attributes
      Array.prototype.forEach.call(node.attrs, function (attribute) {
        text = attribute.value;
        switch (attribute.name) {
        // TODO: need more research on the list of excluded attributes
        case 'id':
        case 'text-id':
        case 'is':
        case 'lang':
        case 'class':
        case 'href':
        case 'src':
        case 'style':
        case 'url':
        case 'value':
        case 'selected':
        case 'assetpath':
          break;
        default:
          if (!isLocalizableAttribute(name, attribute.name)) {
            //console.log('skipping <' + name + ' ' + attribute.name + '>');
            break;
          }
          if (text.length === 0) {
            // skip empty value attribute
          }
          else if (text.match(/^{{.*}}$/) || text.match(/^\[\[.*\]\]$/)) {
            // skip annotation attribute
          }
          else if (text.replace(/\n/g, ' ').match(/^{.*}$/g) || text.replace(/\n/g, ' ').match(/^\[.*\]$/g)) {
            // generate message id
            messageId = generateMessageId(path, id);
            try {
              //console.log(messageId + ' parsing attribute ' + attribute.name + ' = ' + text);
              var value = JSON.parse(text.replace(/\n/g, ' '));
              //console.log('parsed JSON object = ');
              //console.log(value);
              switch (typeof value) {
              case 'string':
              case 'number':
              case 'object':
                // put into model
                attrId = ['model', messageId, attribute.name].join('.');
                setBundleValue(bundle, attrId, value);
                if (replacingText) {
                  attribute.value = '{{' + attrId + '}}';
                }
                break;
              default: // skip other types
                break;
              }
            }
            catch (e) {
              // invalid JSON
              console.warn(e, 'Invalid JSON at <' + name + ' ' + attribute.name + '> with value = ' + text);
            }
          }
          else {
            // string attribute
            messageId = generateMessageId(path, id);
            attrId = ['model', messageId, attribute.name].join('.');
            setBundleValue(bundle, attrId, text);
            if (replacingText) {
              attribute.value = '{{' + attrId + '}}';
            }
          }
          break;
        }
      });
    }

    function traverseTemplateTree(node, path, bundle, index) {
      var i;
      var whiteSpaceElements = 0;
      var isWhiteSpace = false;
      var isCompoundAnnotatedNode = false;
      var text;
      var span;
      var childNodes;
      var childElementCount;
      var childTextNode;
      var name = node.nodeName.toLowerCase();
      var id = dom5.getAttribute(node, 'text-id') || 
                dom5.getAttribute(node, 'id');
      var messageId;
      var n;
      var templateText;
      var templateTextParams;
      path.push(id ? '#' + id : name + (index > 0 ? '_' + index : ''));
      //console.log('name = ' + name + ' id = ' + id);
      //console.log(path.join(':'));
      if (dom5.isElement(node)) {
        //console.log('element ' + name + ' found');
        switch (name) {
        case 'style':
        case 'script':
        case 'meta':
          // skip
          break;
        case 'i18n-format':
          // pick up element attributes
          traverseAttributes(node, path, bundle);
          // generate message id
          messageId = generateMessageId(path, id);
          if (!dom5.hasAttribute(node, 'lang')) {
            dom5.setAttribute(node, 'lang', '{{effectiveLang}}');
          }
          text = Array.prototype.filter.call(node.childNodes, function (child) {
            return dom5.isElement(child);
          }).map(function (param, n) {
            var value = dom5.getTextContent(param);
            var parsedValue = value.match(/^({{)(.*)(}})$/) || 
                              value.match(/^(\[\[)(.*)(\]\])$/);
            if (n === 0) {
              // template element
              if (param.nodeName.toLowerCase() === 'json-data') {
                if (parsedValue) {
                  var parsedValue2 = value.match(/^({{)(serialize\(.*\))(}})$/) || 
                                     value.match(/^(\[\[)(serialize\(.*\))(\]\])$/);
                  if (!parsedValue2) {
                    // convert to {{serialize(id)}}
                    parsedValue.shift();
                    parsedValue.splice(1, 0, 'serialize(');
                    parsedValue.splice(3, 0, ')');
                    dom5.setTextContent(param, parsedValue.join(''));
                  }
                }
                else {
                  value = JSON.parse(value);
                  dom5.setTextContent(param, '{{serialize(text.' + messageId + '.' + n + ')}}');
                }
              }
              else {
                dom5.setTextContent(param, '{{text.' + messageId + '.' + n + '}}');
              }
            }
            else {
              // param element
              // TODO: handle localization of param nodes and attributes
              if (!dom5.hasAttribute(param, 'param')) {
                dom5.setAttribute(param, 'param', '' + n);
              }
              if (param.nodeName.toLowerCase() === 'i18n-number') {
                if (!dom5.hasAttribute(param, 'lang')) {
                  dom5.setAttribute(param, 'lang', '{{effectiveLang}}');
                }
                var offset = dom5.getAttribute(param, 'offset');
                if (offset) {
                  offset = ' - ' + offset;
                }
                else {
                  offset = '';
                }
                if (parsedValue) {
                  // convert to {{path - offset}}
                  parsedValue.shift();
                  parsedValue.splice(2, 0, offset);
                  value = parsedValue.join('');
                }
                else {
                  dom5.setTextContent(param, '{{text.' + messageId + '.' + n + '}}');
                }
              }
              else {
                if (!parsedValue) {
                  dom5.setTextContent(param, '{{text.' + messageId + '.' + n + '}}');
                }
              }
            }
            return value;
          }, this);
          //console.log(messageId + ' = ' + JSONstringify(text, null, 2));
          setBundleValue(bundle, messageId, text);
          break;
        default:
          // element node
          if (name === 'i18n-number' ||
              name === 'i18n-datetime') {
            if (!dom5.hasAttribute(node, 'lang')) {
              dom5.setAttribute(node, 'lang', '{{effectiveLang}}');
            }
          }
          // pick up element attributes
          traverseAttributes(node, path, bundle);
          childElementCount = 0;
          childNodes = node.childNodes;
          childTextNode = null;
          if (childNodes) {
            for (i = 0; i < childNodes.length; i++) {
              if (dom5.isTextNode(childNodes[i])) {
                if (!childTextNode) {
                  childTextNode = childNodes[i];
                }
                else {
                  // multiple text children are not acceptable
                  childElementCount++;
                  break;
                }
              }
              else if (dom5.isElement(childNodes[i])) {
                childElementCount++;
                break; // just 0 or 1 is enough
              }
              else if (dom5.isDocumentFragment(childNodes[i])) {
                childElementCount++;
                break; // just 0 or 1 is enough
              }
            }
          }
          //console.log('childNodes.length = ' + childNodes.length);
          //console.log(node);
          //console.log('childElementCount = ' + childElementCount);
          // check annonated node
          isCompoundAnnotatedNode = false;
          if (childElementCount === 0) {
            if (childTextNode) {
              isCompoundAnnotatedNode = isCompoundAnnotatedText(childTextNode.value);
            }
          }
          if (childElementCount === 0 && !isCompoundAnnotatedNode) {
            if (childTextNode) {
              text = childTextNode.value;
              if (text.length === 0 || text.match(/^\s*$/g)) {
                // skip empty or whitespace node
              }
              else if (text.trim().match(/^({{[^{}]*}}|\[\[[^\[\]]*\]\])$/)) {
                // skip annotation node
              }
              else {
                // a text message found
                // generate message id
                messageId = generateMessageId(path, id);
                // store the text message
                text = text.replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' ');
                if (name === 'json-data') {
                  // parse json-data textContent
                  setBundleValue(bundle, messageId, JSON.parse(text));
                }
                else {
                  setBundleValue(bundle, messageId, text);
                }
                // replace innerText with annotation
                if (replacingText) {
                  childTextNode.value = '{{text.' + messageId + '}}';
                }
                if (!id) {
                  //dom5.setAttribute(node, 'id', messageId);
                  //console.log('add missing node id as ' + messageId + ' for ' + text);
                }
                //console.log(messageId + ' = ' + text);
              }
            }
            else {
              // skip
            }
          } 
          else {
            // has children or compound annotation
            // check if i18n-format is applicable
            var childStatus = Array.prototype.map.call(
              node.childNodes, function (child) {
                var result;
                if (dom5.isElement(child) &&
                    child.nodeName.toLowerCase() === 'template') {
                  var templateNonCommentChildNodes =
                    Array.prototype.filter.call(child.childNodes[0].childNodes, function (templateChild) {
                      if (dom5.isCommentNode(templateChild)) {
                        return false;
                      }
                      else if (dom5.isTextNode(templateChild)) {
                        return !dom5.getTextContent(templateChild).match(/^\s*$/g);
                      }
                      else if (dom5.isElement(templateChild)) {
                        return true;
                      }
                      else {
                        return true;
                      }
                    });
                  var firstChild = templateNonCommentChildNodes.shift();
                  // Examples:
                  // hasText: <template>text</template>
                  // hasCompoundAnnotatedText: <template>{{item.name}} text</template>
                  // hasTextChild: <template><b>text</b></template> or <template><br></template>
                  // hasCompoundAnnotatedChildNode: <template><b>{{item.name}} text</b></template>
                  // hasGrandChildren: <template><span><b>text</b></span></template> or
                  //                   <template><b>A</b><i>B</i></template> or
                  //                   hasCompoundAnnotatedText
                  result = {
                    hasText: templateNonCommentChildNodes.length === 0 &&
                             firstChild &&
                             dom5.isTextNode(firstChild) &&
                             firstChild.value &&
                             !firstChild.value.match(/^\s*$/g),
                    hasCompoundAnnotatedText: firstChild &&
                                              dom5.isTextNode(firstChild) &&
                                              isCompoundAnnotatedText(firstChild.value),
                    hasTextChild: templateNonCommentChildNodes.length === 0 &&
                                  firstChild &&
                                  dom5.isElement(firstChild) &&
                                  ((firstChild.childNodes &&
                                    firstChild.childNodes.length === 1 &&
                                    dom5.isTextNode(firstChild.childNodes[0])) ||
                                   !firstChild.childNodes ||
                                   (firstChild.childNodes &&
                                    firstChild.childNodes.length === 0)), // including <br>
                    hasCompoundAnnotatedChildNode: firstChild &&
                                                   dom5.isElement(firstChild) &&
                                                   ((firstChild.childNodes &&
                                                     firstChild.childNodes.length === 1 &&
                                                     dom5.isTextNode(firstChild.childNodes[0])) ||
                                                    !firstChild.childNodes ||
                                                    (firstChild.childNodes &&
                                                     firstChild.childNodes.length === 0)) &&
                                                   isCompoundAnnotatedText(dom5.getTextContent(firstChild)),
                    hasGrandChildren: templateNonCommentChildNodes.length > 0 ||
                                      (firstChild &&
                                       dom5.isElement(firstChild) &&
                                        Array.prototype.map.call(
                                          firstChild.childNodes,
                                          function (grandChild) {
                                            return !dom5.isTextNode(grandChild);
                                          }
                                        ).reduce(function (prev, current) {
                                          return prev || current;
                                        }, false)) ||
                                      (firstChild &&
                                       dom5.isTextNode(firstChild) &&
                                       isCompoundAnnotatedText(dom5.getTextContent(firstChild)))
                  };
                }
                else {
                  result = {
                    hasText: dom5.isTextNode(child) &&
                             child.value.length > 0 &&
                             !child.value.match(/^\s*$/g),
                    hasCompoundAnnotatedText: dom5.isTextNode(child) &&
                                              isCompoundAnnotatedText(child.value),
                    hasTextChild: dom5.isElement(child) &&
                                  ((child.childNodes &&
                                    child.childNodes.length === 1 &&
                                    dom5.isTextNode(child.childNodes[0])) ||
                                   !child.childNodes ||
                                   (child.childNodes &&
                                    child.childNodes.length === 0)), // including <br>
                    hasCompoundAnnotatedChildNode: dom5.isElement(child) &&
                                                   ((child.childNodes &&
                                                     child.childNodes.length === 1 &&
                                                     dom5.isTextNode(child.childNodes[0])) ||
                                                    !child.childNodes ||
                                                    (child.childNodes &&
                                                     child.childNodes.length === 0)) &&
                                                   isCompoundAnnotatedText(dom5.getTextContent(child)),
                    hasGrandChildren: dom5.isElement(child) &&
                                      child.childNodes.map(function (grandChild) {
                                        return !dom5.isTextNode(grandChild);
                                      }).reduce(function (prev, current) {
                                        return prev || current;
                                      }, false)
                  };
                }
                /*
                console.log('child.nodeName = ' + child.nodeName);
                console.log('child.textContent = ' + dom5.getTextContent(child));
                console.log('child.id = ' + dom5.getAttribute(child, 'id'));
                console.log('result = ' + JSONstringify(result, null, 2));
                */
                return result;
              }).reduce(function (prev, current) { 
                return {
                  hasText: prev.hasText || current.hasText,
                  hasCompoundAnnotatedText: prev.hasCompoundAnnotatedText || current.hasCompoundAnnotatedText,
                  hasTextChild: prev.hasTextChild || current.hasTextChild,
                  hasCompoundAnnotatedChildNode: prev.hasCompoundAnnotatedChildNode || current.hasCompoundAnnotatedChildNode,
                  hasGrandChildren: prev.hasGrandChildren || current.hasGrandChildren
                };
              }, { 
                hasText: false, 
                hasCompoundAnnotatedText: false,
                hasTextChild: false,
                hasCompoundAnnotatedChildNode: false,
                hasGrandChildren: false 
              });
            if ((childStatus.hasText || dom5.getAttribute(node, 'text-id')) && 
                (childStatus.hasTextChild || childStatus.hasCompoundAnnotatedText) && 
                !childStatus.hasGrandChildren &&
                !childStatus.hasCompoundAnnotatedChildNode) {
              // apply i18n-format
              //console.log('applying i18n-format');
              n = 0;
              messageId = generateMessageId(path, id);
              templateTextParams = Array.prototype.map.call(
                node.childNodes, function (child) {
                  var firstChild;
                  if (dom5.isTextNode(child) &&
                      hasAnnotatedText(child.value)) {
                    return compoundAnnotationToSpan(child)
                      .map(function (_child) {
                        return {
                          node: _child,
                          templateNode: null,
                          text: dom5.isTextNode(_child) ? 
                                  _child.value : null,
                          childTextNode: dom5.isElement(_child) &&
                                         _child.childNodes.length > 0
                        };
                      });
                  }
                  else if (dom5.isElement(child) &&
                      child.nodeName.toLowerCase() === 'template') {
                    firstChild =
                      Array.prototype.filter.call(child.childNodes[0].childNodes, function (templateChild) {
                        if (dom5.isCommentNode(templateChild)) {
                          return false;
                        }
                        else if (dom5.isTextNode(templateChild)) {
                          return !dom5.getTextContent(templateChild).match(/^\s*$/g);
                        }
                        else if (dom5.isElement(templateChild)) {
                          return true;
                        }
                        else {
                          return true;
                        }
                      }).shift();
                    return [{
                      node: firstChild,
                      templateNode: child,
                      type: firstChild.nodeType,
                      text: null,
                      childTextNode: true
                    }];
                  }
                  else {
                    return [{
                      node: child,
                      templateNode: null,
                      text: dom5.isTextNode(child) ? 
                              child.value : null,
                      childTextNode: dom5.isElement(child) &&
                                     child.childNodes.length > 0
                    }];
                  }
                }).reduce(function (prev, currentList) {
                  var current;
                  var textContent;
                  for (var i = 0; i < currentList.length; i++) {
                    current = currentList[i];
                    if (current.text) {
                      prev.text[0] += current.text;
                    }
                    if (dom5.isElement(current.node)) {
                      n++;
                      prev.text[0] += '{' + n + '}';
                      path.push(n);
                      traverseAttributes(current.node, path, bundle);
                      path.pop();
                      if (current.childTextNode) {
                        var textContent = dom5.getTextContent(current.node);
                        if (textContent.length === 0) {
                          // tag without innerText
                          prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                          dom5.setTextContent(current.node, '');
                        }
                        else if (textContent.match(/^\s*$/g)) {
                          // tag with whitespace innerText
                          prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                          dom5.setTextContent(current.node, ' ');
                        }
                        else if (textContent.match(/^[\s]*({{.*}}|\[\[.*\]\])[\s]*$/)) {
                          // tag with annotation
                          prev.text.push(textContent);
                          // textContent is untouched
                        }
                        else {
                          prev.text.push(dom5.getTextContent(current.node).replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' '));
                          if (replacingText) {
                            dom5.setTextContent(current.node, '{{text.' + messageId + '.' + n + '}}');
                          }
                        }
                      }
                      else {
                        prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                      }
                      dom5.setAttribute(current.node, 'param', n.toString());
                      prev.params.push(current.templateNode || current.node);
                    }
                    else if (dom5.isTextNode(current.node) &&
                             current.childTextNode) {
                      // in template node
                      n++;
                      prev.text[0] += '{' + n + '}';
                      textContent = dom5.getTextContent(current.node);
                      if (textContent.length === 0) {
                        // template without textContent
                        prev.text.push('<template>');
                        dom5.setTextContent(current.node, '');
                      }
                      else if (textContent.match(/^\s*$/g)) {
                        // template with whitespace textContent
                        prev.text.push('<template>');
                        dom5.setTextContent(current.node, ' ');
                      }
                      else if (textContent.match(/^[\s]*({{.*}}|\[\[.*\]\])[\s]*$/)) {
                        // tag with annotation
                        prev.text.push(textContent);
                        // textContent is untouched
                      }
                      else {
                        prev.text.push(textContent.replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' '));
                        dom5.setTextContent(current.node, '{{text.' + messageId + '.' + n + '}}');
                      }
                      span = dom5.constructors.element('span');
                      dom5.setAttribute(span, 'param', n.toString());
                      dom5.remove(current.node);
                      dom5.append(span, current.node);
                      dom5.append(current.templateNode.childNodes[0], span);
                      prev.params.push(current.templateNode);
                    }
                  }
                  return prev;
                }, { text: [ '' ], params: [ '{{text.' + messageId + '.0}}' ] });
              // store the text message
              templateTextParams.text[0] = templateTextParams.text[0].replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' ');
              setBundleValue(bundle, messageId, templateTextParams.text);
              //console.log(messageId + ' = ' + templateTextParams.text);
              if (replacingText) {
                templateText = dom5.constructors.element('i18n-format');
                dom5.setAttribute(templateText, 'lang', '{{effectiveLang}}');
                span = dom5.constructors.element('span');
                childTextNode = dom5.constructors.text(templateTextParams.params.shift());
                dom5.append(span, childTextNode);
                dom5.append(templateText, span);
                Array.prototype.forEach.call(templateTextParams.params,
                  function (param) {
                    dom5.append(templateText, param);
                  }
                );
                // insert i18n-format
                while (node.childNodes.length > 0) {
                  dom5.remove(node.childNodes[0]);
                }
                dom5.append(node, templateText);
                if (!id) {
                  //dom5.setAttribute(node, 'id', messageId);
                  //console.log('add missing node id as ' + messageId + ' for ' + templateTextParams.text[0]);
                }
              }
            }
            else {
              // traverse childNodes
              //console.log('traversing into childNodes');
              for (i = 0; i < node.childNodes.length; i++) {
                //console.log(path.join(':') + ':' + node.childNodes[i].nodeName + ':' + (i - whiteSpaceElements) + ' i = ' + i + ' whiteSpaceElements = ' + whiteSpaceElements);
                if (traverseTemplateTree(node.childNodes[i], path, bundle, i - whiteSpaceElements)) {
                  whiteSpaceElements++;
                }
              }
            }
          }
          break;
        }
      }
      else if (dom5.isTextNode(node)) {
        // text node
        text = node.value;
        if (text.length === 0 || text.match(/^\s*$/g)) {
          // skip empty or whitespace node
          isWhiteSpace = true;
        }
        else if (text.trim().match(/^({{[^{}]*}}|\[\[[^\[\]]*\]\])$/)) {
          // skip annotation node
        }
        else {
          if (isCompoundAnnotatedText(text)) {
            // apply i18n-format
            n = 0;
            messageId = generateMessageId(path, id);
            templateTextParams = Array.prototype.map.call(
              [ node ], function (child) {
                if (dom5.isTextNode(child) &&
                    hasAnnotatedText(child.value)) {
                  return compoundAnnotationToSpan(child)
                    .map(function (_child) {
                      return {
                        node: _child,
                        text: dom5.isTextNode(_child) ? 
                                _child.value : null,
                        childTextNode: dom5.isElement(_child) &&
                                       _child.childNodes.length > 0
                      };
                    });
                }
                else {
                  return [{
                    node: child,
                    text: dom5.isTextNode(child) ? 
                            child.value : null,
                    childTextNode: dom5.isElement(child) &&
                                   child.childNodes.length > 0
                  }];
                }
              }).reduce(function (prev, currentList) {
                var current;
                for (var i = 0; i < currentList.length; i++) {
                  current = currentList[i];
                  if (current.text) {
                    prev.text[0] += current.text;
                  }
                  if (dom5.isElement(current.node)) {
                    n++;
                    prev.text[0] += '{' + n + '}';
                    path.push(n);
                    traverseAttributes(current.node, path, bundle);
                    path.pop();
                    if (current.childTextNode) {
                      var textContent = dom5.getTextContent(current.node);
                      if (textContent.length === 0) {
                        // tag without innerText
                        prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                        dom5.setTextContent(current.node, '');
                      }
                      else if (textContent.match(/^\s*$/g)) {
                        // tag with whitespace innerText
                        prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                        dom5.setTextContent(current.node, ' ');
                      }
                      else if (textContent.match(/^({{.*}}|\[\[.*\]\])$/)) {
                        // tag with annotation
                        prev.text.push(textContent);
                        // textContent is untouched
                      }
                      else {
                        prev.text.push(dom5.getTextContent(current.node).replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' '));
                        if (replacingText) {
                          dom5.setTextContent(current.node, '{{text.' + messageId + '.' + n + '}}');
                        }
                      }
                    }
                    else {
                      prev.text.push('<' + current.node.nodeName.toLowerCase() + '>');
                    }
                    dom5.setAttribute(current.node, 'param', n.toString());
                    prev.params.push(current.node);
                  }
                }
                return prev;
              }, { text: [ '' ], params: [ '{{text.' + messageId + '.0}}' ] });
            // store the text message
            templateTextParams.text[0] = templateTextParams.text[0].replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' ');
            setBundleValue(bundle, messageId, templateTextParams.text);
            //console.log(messageId + ' = ' + templateTextParams.text);
            if (replacingText) {
              templateText = dom5.constructors.element('i18n-format');
              dom5.setAttribute(templateText, 'lang', '{{effectiveLang}}');
              span = dom5.constructors.element('span');
              childTextNode = dom5.constructors.text(templateTextParams.params.shift());
              dom5.append(span, childTextNode);
              dom5.append(templateText, span);
              Array.prototype.forEach.call(templateTextParams.params,
                function (param) {
                  dom5.append(templateText, param);
                }
              );
              // insert i18n-format
              dom5.replace(node, templateText);
              if (!id) {
                //dom5.setAttribute(node, 'id', messageId);
                //console.log('add missing node id as ' + messageId + ' for ' + templateTextParams.text[0]);
              }
            }
          }
          else {
            // generate message id
            messageId = generateMessageId(path, id);
            // store the text message
            text = text.replace(/^[\s]*[\s]/, ' ').replace(/[\s][\s]*$/, ' ');
            setBundleValue(bundle, messageId, text);
            //console.log(messageId + ' = ' + text);
            if (replacingText) {
              // replace innerText with annotation
              dom5.setTextContent(node, '{{text.' + messageId + '}}');
              if (!id) {
                //dom5.setAttribute(span, 'id', messageId);
                //console.log('add missing span with id as ' + messageId + ' for ' + text);
              }
            }
          }
        }
      }
      else if (dom5.isDocument(node) || dom5.isDocumentFragment(node)) {
        // traverse childNodes
        //console.log('documentFragment found');
        for (i = 0; i < node.childNodes.length; i++) {
          //console.log(path.join(':') + ':' + node.childNodes[i].nodeName + ':' + (i - whiteSpaceElements) + ' i = ' + i + ' whiteSpaceElements = ' + whiteSpaceElements);
          if (traverseTemplateTree(node.childNodes[i], path, bundle, i - whiteSpaceElements)) {
            whiteSpaceElements++;
          }
        }
      }
      else {
        // comment node, etc.
        isWhiteSpace = true;
      }
      path.pop();
      return isWhiteSpace;
    }

    /**
     * Check if the text has compound annotation 
     * 
     * @param {string} text target text to check compound annotation
     * @return {Boolean} true if the text contains compound annotation
     */
    function isCompoundAnnotatedText (text) {
      return !text.trim().match(/^({{[^{}]*}}|\[\[[^\[\]]*\]\])$/) &&
             !!text.match(/({{[^{}]*}}|\[\[[^\[\]]*\]\])/);
    }

    /**
     * Check if the text has annotation 
     * 
     * @param {string} text target text to check annotation
     * @return {Boolean} true if the text contains annotation
     */
    function hasAnnotatedText (text) {
      return !!text.match(/({{[^{}]*}}|\[\[[^\[\]]*\]\])/);
    }

    /**
     * Convert compound annotations to span elements
     * 
     * @param {Text} node target text node to convert compound annotations
     * @return {Object[]} Array of Text or span elements
     */
    function compoundAnnotationToSpan (node) {
      var result;
      var textContent = dom5.getTextContent(node);
      if (textContent.match(/({{[^{}]*}}|\[\[[^\[\]]*\]\])/)) {
        result = textContent
          .match(/({{[^{}]*}}|\[\[[^\[\]]*\]\]|[^{}\[\]]{1,}|[{}\[\]]{1,})/g)
          .reduce(function (prev, current) {
            if (current.match(/^({{[^{}]*}}|\[\[[^\[\]]*\]\])$/)) {
              prev.push(current);
              prev.push('');
            }
            else {
              if (prev.length === 0) {
                prev.push(current);
              }
              else {
                prev[prev.length - 1] += current;
              }
            }
            return prev;
          }, [])
          .map(function (item) {
            var childNode;
            if (item.match(/^({{[^{}]*}}|\[\[[^\[\]]*\]\])$/)) {
              childNode = dom5.constructors.element('span');
              dom5.append(childNode, dom5.constructors.text(item));
            }
            else {
              childNode = dom5.constructors.text(item);
            }
            return childNode;
          });
        if (result.length > 0) {
          if (!result[result.length - 1]) {
            result.pop(); // pop ''
          }
        }
      }
      else {
        // no compound annotation
        result = [ node ];
      }
      return result;
    }

    function setBundleValue(bundle, messageId, value) {
      var messageIdPath = messageId.split('.');
      if (messageIdPath.length === 1) {
        bundle[messageId] = value;
      }
      else {
        var cursor = bundle;
        for (var i = 0; i < messageIdPath.length; i++) {
          if (i < messageIdPath.length - 1) {
            cursor[messageIdPath[i]] = cursor[messageIdPath[i]] || {};
            cursor = cursor[messageIdPath[i]];
          }
          else {
            cursor[messageIdPath[i]] = value;
          }
        }
      }
    }

    function deepMap(target, source, map) {
      var value;
      for (var prop in source) {
        value = source[prop];
        switch (typeof value) {
        case 'string':
        case 'number':
        case 'boolean':        
          target[prop] = map(value, prop);
          break;
        case 'object':
          if (Array.isArray(value)) {
            // TODO: cannot handle deep objects properly
            target[prop] = target[prop] || [];
            deepMap(target[prop], value, map);
          }
          else {
            target[prop] = target[prop] || {};
            deepMap(target[prop], value, map);
          }
          break;
        case 'function':
        case 'symbol':
        case 'undefined':
          target[prop] = value;
          break;
        default:
          target[prop] = value;
          break;
        }
      }
    }

    // TODO: shorten or optimize ids
    function generateMessageId(path, id) {
      var messageId;
      if (!id || id.length === 0) {
        for (var i = 1; i < path.length; i++) {
          if (path[i][0] === '#') {
            if (path[i] !== '#document-fragment') {
              if (messageId && path[i].substr(0, 5) === '#text') {
                messageId += ':' + path[i].substr(1);
              }
              else {
                messageId = path[i].substr(1);
              }
            }
          }
          else {
            if (messageId) {
              messageId += ':' + path[i];
            }
            else {
              messageId = path[i];
            }
          }
        }
      }
      else {
        messageId = id;
      }
      return messageId;
    }

    function splitFile(file, filename, contents) {
      return new gutil.File({
        cwd: file.cwd,
        base: file.base,
        path: path.join(path.dirname(file.path), filename),
        contents: new Buffer(contents)
      });
    }

    function getFilenames(filepath, bundles) {
      var basename = path.basename(filepath, path.extname(filepath));
      var filenames = dropHtml ? {} : { html: basename + '.html' };
      for (var moduleId in bundles) {
        filenames[moduleId] = moduleId + '.json';
      }
      return filenames;
    }

    function doPreprocess() {
      if (file.isNull()) {
        callback(null, file);
        return;
      }

      if (file.isStream()) {
        callback(new gutil.PluginError('externalize', 'Streaming not supported'));
        return;
      }

      if (file.isBuffer()) {
        var contents = String(file.contents);
        var bundles = {};
        var status = {};
        var result = constructMessageBundle(file, contents, bundles, status);
        var moduleId;
        if (status.localizable && !constructAttributesRepository) {
          var splitFiles = getFilenames(file.path, bundles);
          var splitContents = { html: result };
          for (moduleId in bundles) {
            splitContents[moduleId] = JSONstringify(bundles[moduleId], null, jsonSpace); 
          }

          Object.keys(splitFiles).forEach(function(type) {
            if (splitContents[type]) {
              stream.push(splitFile(file, splitFiles[type], splitContents[type]));
            }
          });

          return callback();
        }
        else {
          file.contents = new Buffer(result);
          return callback(null, dropHtml ? null : file);
        }
      }

      callback(null, file);
    }

    doPreprocess();
  };

  return through.obj(doPreprocess);
};
