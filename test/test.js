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
  }
  return file;
}

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

var suites = [
  { 
    suite: 'scan',
    options: {
      replacingText: false,
      jsonSpace: 2,
      srcPath: 'test/src',
      force: false,
      dropHtml: true,
      constructAttributesRepository: true,
      attributesRepository: {},
      attributesRepositoryPath: 'bower_components/i18n-behavior/i18n-attr-repo.html'.replace(/\//g, path.sep)
    },
    srcBaseDir: 'test/src',
    targets: [ 'simple-text-element.html' ],
    expectedBaseDir: 'test/expected',
    expected: [],
    attributesRepository: attributesRepository_standard
  },
  { 
    suite: 'simple-text-element',
    options: {
      replacingText: true,
      jsonSpace: 2,
      srcPath: 'test/src',
      force: false,
      dropHtml: false,
      constructAttributesRepository: false,
      attributesRepository: attributesRepository_standard,
      attributesRepositoryPath: null
    },
    srcBaseDir: 'test/src',
    targets: [ 'simple-text-element.html' ],
    expectedBaseDir: 'test/expected',
    expected: [ 'simple-text-element.html', 'simple-text-element.json' ],
    attributesRepository: undefined
  }
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

    suite(params.suite, function () {
      suiteSetup(function () {
        preprocessor = i18nPreprocess(options);
        inputs = params.targets.map(function (target) {
          return new gutil.File({
            cwd: __dirname,
            base: path.join(__dirname, target.replace(/\//g, path.sep)),
            path: path.join(params.srcBaseDir.replace(/\//g, path.sep), target),
            contents: fs.readFileSync(path.join(params.srcBaseDir.replace(/\//g, path.sep), target))
          });
        });
        outputs = [];
        expectedPaths = params.expected.map(function (outputPath) {
          return path.join(params.expectedBaseDir, outputPath.replace(/\//g, path.sep));
        });
        expected = expectedPaths.map(function (target) {
          return new gutil.File({
            cwd: __dirname,
            base: path.join(__dirname, target.replace(/\//g, path.sep)),
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
    })
  });
});
