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
  if (file && file.path && srcBaseDir && expectedBaseDir) {
    srcBaseDir = srcBaseDir.replace(/\//g, path.sep);
    if (file.path.substr(0, srcBaseDir.length) === srcBaseDir) {
      file.path = path.join(expectedBaseDir.replace(/\//g, path.sep),
                            file.path.substr(srcBaseDir.length));
    }
    else {
      srcBaseDir = path.resolve(srcBaseDir);
      if (file.path.substr(0, srcBaseDir.length) === srcBaseDir) {
        file.path = path.join(expectedBaseDir.replace(/\//g, path.sep),
                              file.path.substr(srcBaseDir.length));
      }
    }
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
  })
];

suite('gulp-i18n-preprocess', function () {
  suites.forEach(function (params) {
    var preprocessor;
    var options = params.options;
    var inputs;
    var outputs;
    var expectedPaths;
    var expected;
    var attributesRepository;

    if (!params.suite) {
      return;
    }

    suite(params.suite, function () {
      suiteSetup(function () {
        preprocessor = i18nPreprocess(options);
        inputs = params.gulp ? 
          params.targets.map(function (target) {
            return [ params.srcBaseDir, target ].join('/');
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
        if (typeof params.expected === 'function') {
          params.expected = params.expected(params.targets);
        }
        expectedPaths = params.expected.map(function (outputPath) {
          return path.join(params.expectedBaseDir, n2h(outputPath));
        });
        expected = expectedPaths.map(function (target) {
          return new gutil.File({
            cwd: __dirname,
            base: path.join(__dirname, n2h(target)),
            path: target,
            contents: fs.readFileSync(target)
          });
        });
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
              .pipe(preprocessor)
              .pipe(through.obj(function (file, enc, callback) {
                assert.ok(file instanceof gutil.File, 'get a File instance for ' + file.path);
                convertToExpectedPath(file, params.srcBaseDir, params.expectedBaseDir);
                outputs.push(file);
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

      if (params.expected.length > 0) {
        test('check preprocessed file list', function () {
          outputs.forEach(function (file, index) {
            assert.equal(file.path, expectedPaths[index], expectedPaths[index] + ' is output');
          });
          assert.equal(outputs.length, expectedPaths.length,
            'get expected ' + expectedPaths.length + ' files');
        });

        test('check preprocessed file contents', function () {
          outputs.forEach(function (file, index) {
            assert.equal(file.contents.toString(), expected[index].contents.toString(),
              'get expected file contents for ' + expected[index].path);
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
          assert.deepEqual(attributesRepository, params.attributesRepository, 'get an expected attributesRepository');
        });
      }

      suiteTeardown(function () {
      });
    });
  });
});
