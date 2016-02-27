/*
@license https://github.com/t2ym/gulp-i18n-preprocess/blob/master/LICENSE.md
Copyright (c) 2016, Tetsuya Mori <t2y3141592@gmail.com>. All rights reserved.
*/
'use strict';

var chai = require('chai');
var assert = chai.assert;
var path = require('path');
var fs = require('fs');
var gutil = require('gulp-util');
var stream = require('stream');
var isStream = require('is-stream');
var gulp = require('gulp');
var debug = require('gulp-debug');

var through = require('through2');
var dom5 = require('dom5');
var JSONstringify = require('json-stringify-safe');

var i18nPreprocess = require('../');

chai.config.showDiff = true;

/*

`i18nPreprocess(options)`

### `options` object

- replacingText: Boolean, default: false - If true, UI texts are replaced with {{annotations}}
- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- force: Boolean, default: false - Force preprocessing even if i18n-behavior.html is not imported
- dropHtml: Boolean, default: false - If true, drop the preprocessed HTML for output
- constructAttributesRepository: Boolean, default: false - If true, construct localizable attributes repository
- attributesRepository: Object, default: {} - Input/Output - attributes respository object
- attributesRepositoryPath: String, default: null - Path to bower_components/i18n-behavior/i18n-attr-repo.html

*/

function convertToExpectedPath (file, srcBaseDir, expectedBaseDir) {
  var target;
  if (file instanceof gutil.File) {
    target = file.path;
  }
  else {
    target = file;
  }
  if (target && srcBaseDir && expectedBaseDir) {
    srcBaseDir = srcBaseDir.replace(/\//g, path.sep);
    if (target.substr(0, srcBaseDir.length) === srcBaseDir) {
      target = path.join(expectedBaseDir.replace(/\//g, path.sep),
                        target.substr(srcBaseDir.length));
    }
    else {
      srcBaseDir = path.resolve(srcBaseDir);
      if (target.substr(0, srcBaseDir.length) === srcBaseDir) {
        target = path.join(expectedBaseDir.replace(/\//g, path.sep),
                          target.substr(srcBaseDir.length));
      }
    }
  }
  if (file instanceof gutil.File) {
    file.path = target;
  }
  else {
    file = target;
  }
  return file;
}

function n2h (target) {
  if (path.sep === '/') {
    return target;
  }
  if (target) {
    if (Array.isArray(target)) {
      return target.map(function (item) { return n2h(item); });
    }
    else if (typeof target === 'string') {
      return target.replace(/\//g, path.sep);
    }
    else {
      return target;
    }
  }
  else {
    return target;
  }
}

// Test suite inheritance utilities
var p = Object.setPrototypeOf || function (target, base) { 
  var obj = Object.create(base);
  for (var p in target) {
    obj[p] = target[p];
  }
  return obj;
};
var _name = 'suite';
var suiteMap = {};
var s = function (name, baseName, extension) {
  if (suiteMap[name]) {
    throw new Error('duplicate suite name ' + name);
  }
  if (baseName && !suiteMap[baseName]) {
    throw new Error('inexistent base suite name ' + baseName);
  }
  extension[_name] = name;
  extension = p(extension, suiteMap[baseName] || {});
  suiteMap[name] = extension;
  return extension;
};

var attributesRepository_standard = {
  'input': {
    'placeholder': true
  },
  'paper-input': {
    'label': true,
    'error-message': true,
    'placeholder': true
  },
  'paper-textarea': {
    'label': true,
    'error-message': true,
    'placeholder': true
  },
  'paper-dropdown-menu': {
    'label': true
  },
  'paper-toast': {
    'text': true
  },
  'google-chart': {
    'options': true,
    'cols': true,
    'rows': true,
    'data': true
  },
  'platinum-push-messaging': {
    'title': true,
    'message': true
  },
  'json-data': {
    'any-attributes': true
  }
};

var attributesRepository_custom = p({
  'text-attribute-element': {
    'custom-text-attr1': true,
    'custom-text-attr2': true,
    'custom-text-attr3': true
  }
}, attributesRepository_standard);

var attributesRepository_saved;

var options_base = {
  replacingText: false,
  jsonSpace: 2,
  srcPath: 'test/src',
  force: false,
  dropHtml: false,
  constructAttributesRepository: false,
  attributesRepository: attributesRepository_standard,
  attributesRepositoryPath: null
};

var params_base = {
  suite: null,
  options: options_base,
  srcBaseDir: 'test/src',
  targets: [],
  expectedBaseDir: 'test/expected',
  expected: []
};

function appendJson (list) {
  if (list && Array.isArray(list)) {
    return list.map(function (item) {
      if (typeof item === 'string') {
        item = [ item, item.replace(/[.]html$/, '.json') ];
      }
      return item;
    }).reduce(function (prev, curr) {
      if (Array.isArray(curr)) {
        curr.forEach(function (item) {
          prev.push(item);
        });
      }
      else {
        prev.push(item);
      }
      return prev;
    }, []);
  }
  else {
    return list;
  }
}

function fromExpected (expectedBaseDir) {
  var buffer = fs.readFileSync(path.join(expectedBaseDir, 'attributes-repository.json'), 'utf8');
  return JSON.parse(buffer.toString());
}

var suites = [
  s(null, null, params_base),
  s('scan', null, { 
    options: p({
      dropHtml: true,
      constructAttributesRepository: true,
      attributesRepository: {},
      attributesRepositoryPath: n2h('bower_components/i18n-behavior/i18n-attr-repo.html')
    }, options_base),
    targets: [ 'simple-text-element.html' ],
    attributesRepository: attributesRepository_standard
  }),
  s('gulp scan', 'scan', {
    gulp: true
  }),
  s('scan custom', 'scan', {
    targets: [ 'text-attribute-element.html' ],
    attributesRepository: attributesRepository_custom
  }),
  s('gulp scan custom', 'scan custom', {
    gulp: true
  }),
  s('simple-text-element', null, {
    options: p({
      replacingText: true,
      attributesRepository: attributesRepository_standard,
    }, options_base),
    targets: [ 'simple-text-element.html' ],
    expected: appendJson
  }),
  s('gulp simple-text-element', 'simple-text-element', {
    gulp: true
  }),
  s('i18n-dom-bind', 'simple-text-element', {
    options: p({
      replacingText: true,
      force: true,
      attributesRepository: attributesRepository_custom
    }, options_base),
    targets: [ 'basic-test.html' ],
    expected: [
      'basic-test.html', 
      'simple-text-dom-bind.json',
      'simple-attribute-dom-bind.json',
      'compound-binding-dom-bind.json'
    ]
  }),
  s('gulp i18n-dom-bind', 'i18n-dom-bind', {
    gulp: true
  }),
  // test with i18n-behavior test fixtures
  // Note: Version of i18n-behavior must be carefully chosen in bower.json
  //       so that actual outputs can be checked against the preprocessed output 
  //       from a STABLE and TEST-PASSING i18n-behavior release.  Otherwise,
  //       the following test suites would be meaningless because the expected outputs 
  //       are actually just output by gulp-i18n-preprocess of an unstable version. 
  s('gulp i18n-behavior/test/src scan', null, {
    gulp: true,
    options: p({
      srcPath: 'bower_components/i18n-behavior/test/src',
      dropHtml: true,
      constructAttributesRepository: true,
      attributesRepository: {},
      attributesRepositoryPath: n2h('bower_components/i18n-behavior/i18n-attr-repo.html')
    }, options_base),
    srcBaseDir: 'bower_components/i18n-behavior/test/src',
    targets: [ '**/*.html', '!**/*-test.html' ],
    expectedBaseDir: 'bower_components/i18n-behavior/test/preprocess',
    attributesRepository: fromExpected
  }),
  s('gulp i18n-behavior/test/src preprocess', null, {
    gulp: true,
    options: p({
      replacingText: true,
      srcPath: 'bower_components/i18n-behavior/test/src',
      attributesRepository: fromExpected
    }, options_base),
    srcBaseDir: 'bower_components/i18n-behavior/test/src',
    targets: [ '**/*.html', '!**/*-test.html' ],
    expectedBaseDir: 'bower_components/i18n-behavior/test/preprocess',
    expected: appendJson
  }),
  s('gulp i18n-behavior/test/src/*-test.html preprocess', 'gulp i18n-behavior/test/src preprocess', {
    options: p({
      replacingText: true,
      srcPath: 'bower_components/i18n-behavior/test/src',
      force: true,
      attributesRepository: fromExpected
    }, options_base),
    targets: [ '**/*-test.html' ],
    expected: [
      'basic-test.html', 
      'simple-text-dom-bind.json',
      'simple-attribute-dom-bind.json',
      'compound-binding-dom-bind.json'
    ]
  })
];

suite('gulp-i18n-preprocess', function () {
  suites.forEach(function (params) {
    var preprocessor;
    var options = params.options;
    var inputs;
    var expandedInputPaths;
    var outputs;
    var expectedPaths;
    var expected;
    var attributesRepository;

    if (!params.suite) {
      return;
    }

    suite(params.suite, function () {
      suiteSetup(function () {
        if (params.gulp && 
          !params.options.constructAttributesRepository &&
          typeof params.options.attributesRepository === 'function') {
          options.attributesRepository = params.options.attributesRepository(params.expectedBaseDir);
        }
        preprocessor = i18nPreprocess(options);
        inputs = params.gulp ? 
          params.targets.map(function (target) {
            return target.match(/^!/) ? 
              '!' + [ params.srcBaseDir, target.substr(1) ].join('/') :
              [ params.srcBaseDir, target ].join('/')
          }) :
          params.targets.map(function (target) {
            return new gutil.File({
              cwd: __dirname,
              base: path.join(__dirname, n2h(target)),
              path: path.join(n2h(params.srcBaseDir), target),
              contents: fs.readFileSync(path.join(n2h(params.srcBaseDir), target))
            });
          });
        outputs = [];
        if (params.expected) {
          expectedPaths = undefined;
          if (!params.gulp &&
            typeof params.expected === 'function') {
            expectedPaths = params.expected(params.targets).map(function (outputPath) {
                return path.join(params.expectedBaseDir, n2h(outputPath));
              });
          }
          else if (Array.isArray(params.expected)) {
            expectedPaths = params.expected.map(function (outputPath) {
                return path.join(params.expectedBaseDir, n2h(outputPath));
              });
          }
          expected = expectedPaths ? 
            expectedPaths.map(function (target) {
              return new gutil.File({
                cwd: __dirname,
                base: path.join(__dirname, n2h(target)),
                path: target,
                contents: fs.readFileSync(target)
              })
            }) : null;
        }
        if (params.gulp) {
          expandedInputPaths = [];
        }
        if (params.attributesRepository &&
            params.options && params.options.constructAttributesRepository) {
          attributesRepository = {};
          params.options.attributesRepository = attributesRepository;
        }
      });

      test('get a duplex stream', function () {
        assert.ok(isStream.duplex(preprocessor), 'preprocessor is a duplex stream');
      });

      if (params.gulp) {
        test('preprocess in gulp', function (done) {
          gulp.task('preprocess', function () {
            return gulp.src(inputs, { base: params.srcBaseDir })
              .pipe(through.obj(function (file, enc, callback) {
                expandedInputPaths.push(file.path);
                callback(null, file);
              }))
              .pipe(preprocessor)
              .pipe(through.obj(function (file, enc, callback) {
                assert.ok(file instanceof gutil.File, 'get a File instance for ' + file.path);
                convertToExpectedPath(file, params.srcBaseDir, params.expectedBaseDir);
                outputs.push(file);
                callback(null, file);
              }))
              .pipe(debug({ title: 'preprocess output:'}))
              .pipe(through.obj(function (file, enc, callback) {
                callback(null, null);
              }));
          });
          gulp.start.apply(gulp, [ 'preprocess', function () {
            gulp.reset();
            done();
          }]);
        });
      }
      else {
        test('get preprocessed files', function (done) {
          preprocessor.on('data', function (file) {
            assert.ok(file instanceof gutil.File, 'get a File instance for ' + file.path);
            convertToExpectedPath(file, params.srcBaseDir, params.expectedBaseDir);
            outputs.push(file);
          });

          preprocessor.on('end', done);

          inputs.forEach(function (file) {
            preprocessor.write(file);
          });

          preprocessor.end();
        });
      }

      if ((params.expected && params.expected.length > 0) ||
          !params.expected) {
        if (params.expected) {
          test('check preprocessed file list', function () {
            if (params.gulp) {
              if (typeof params.expected === 'function' &&
                  expandedInputPaths) {
                expectedPaths = params.expected(expandedInputPaths).map(function (target) {
                  var result = convertToExpectedPath(target, params.srcBaseDir, params.expectedBaseDir);
                  return result;
                });
              }
              else if (Array.isArray(params.expected)) {
                expectedPaths = params.expected.map(function (target) {
                  return path.join(params.expectedBaseDir, target);
                });
              }
            }
            outputs.forEach(function (file, index) {
              assert.equal(file.path, expectedPaths[index], expectedPaths[index] + ' is output');
            });
            assert.equal(outputs.length, expectedPaths.length,
              'get expected ' + expectedPaths.length + ' files');
          });
        }

        test('check preprocessed file contents', function () {
          outputs.forEach(function (file, index) {
            var expectedFile = expected ? expected[index] : null;
            if (!expected) {
              expectedFile = new gutil.File({
                cwd: __dirname,
                base: file.base,
                path: file.path,
                contents: fs.readFileSync(file.path)
              });
            }
            if (file.contents.toString() !== expectedFile.contents.toString()) {
              console.log('file.path = ' + file.path);
              console.log('expected = ' + expectedFile.contents.toString());
              console.log('actual = ' + file.contents.toString());
            }
            assert.equal(file.contents.toString(), expectedFile.contents.toString(),
              'get expected file contents for ' + expectedFile.path);
          });
        });
      }
      else {
        test('no outputs', function () {
          assert.equal(outputs.length, 0, 'get no outputs');
        });
      }

      if (params.attributesRepository) {
        test('check attributesRepository', function () {
          var expectedAttributesRepository;
          if (typeof params.attributesRepository === 'function') {
            expectedAttributesRepository = params.attributesRepository(params.expectedBaseDir);
          }
          else {
            expectedAttributesRepository = params.attributesRepository;
          }
          assert.deepEqual(attributesRepository,
            expectedAttributesRepository,
            'get expected attributesRepository');
        });
      }

      suiteTeardown(function () {
      });
    });
  });
});
