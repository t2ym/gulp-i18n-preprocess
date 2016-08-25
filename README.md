[![Build Status](https://travis-ci.org/t2ym/gulp-i18n-preprocess.svg?branch=master)](https://travis-ci.org/t2ym/gulp-i18n-preprocess)
[![Coverage Status](https://coveralls.io/repos/github/t2ym/gulp-i18n-preprocess/badge.svg?branch=master&build=50)](https://coveralls.io/github/t2ym/gulp-i18n-preprocess?branch=master)
[![npm](https://img.shields.io/npm/v/gulp-i18n-preprocess.svg)](https://www.npmjs.com/package/gulp-i18n-preprocess)

# gulp-i18n-preprocess

Preprocess Polymer templates and extract UI strings to JSON for build-time I18N with [i18n-behavior](https://github.com/t2ym/i18n-behavior)

![Build-Time I18N](https://raw.githubusercontent.com/wiki/t2ym/gulp-i18n-preprocess/BuildTimeI18nFlow.gif)

## Features

- Preprocess Polymer templates to replace hard-coded UI strings with {{annotated}} variables
- Extract hard-coded UI strings to JSON 
- Embed the JSON to the target preprocessed templates as default strings
- Export the JSON as files
- Scan custom element HTMLs for constructing repository for I18N target attributes
- Build-time functionalities in [gulp-i18n-preprocess](https://github.com/t2ym/gulp-i18n-preprocess) are in sync with those in [i18n-behavior](https://github.com/t2ym/i18n-behavior) at run-time

## Install

```
    npm install --save-dev gulp-i18n-preprocess
```

[Quick Tour](#quick-tour) with [polymer-starter-kit-i18n](https://github.com/t2ym/polymer-starter-kit-i18n)

## Workflow

Build tasks from source to dist:

### 1. Scan task

  - Scan source HTMLs for custom elements
  - Construct localizable attributes repository

### 2. Preprocess task

  - Preprocess source HTMLs
  - Extract UI texts to JSON as default
  - Replace them with {{annotations}}
  - Embed default texts in HTMLs as JSON
  - Externalize default texts to JSON files
  - Put them in dist

### 3. (Optional) Import XLIFF task with [xliff-conv](https://github.com/t2ym/xliff-conv)

### 4. Leverage task with [gulp-i18n-leverage](https://github.com/t2ym/gulp-i18n-leverage) 

  - Update localized JSON files by merging differences in default JSON from the previous build
  - Put them in dist
  - Merge all the UI texts into bundles object

### 5. Bundles task with `fs.writeFileSync()`

  - Generate default bundled JSON file `bundle.json` from the bundles object
  - Generate per-locale bundled JSON files `bundle.*.json` from the bundles object
  - Put them in dist

### 6. (Optional) Export XLIFF task with [xliff-conv](https://github.com/t2ym/xliff-conv)

### 7. Feedback task

  - Update default and localized JSON files in source to commit them later by a developer or a build system

## Usage

### Default options

Sample to show default options:

```javascript
    var gulp = require('gulp');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    gulp.task('preprocess', function () {
      // default options values
      var options = {
        replacingText: false, // does not replace strings with {{annotations}}
        jsonSpace: 2, // JSON stringification parameter for formatting
        srcPath: 'app', // base source path
        force: false, // does not force preprocessing when i18n-behavior.html is not imported
        dropHtml: false, // does not drop the preprocessed HTML for output
        dropJson: false, // does not drop the extracted JSON files for output
        constructAttributesRepository: false, // does not construct localizable attributes repository
        attributesRepositoryPath: null // does not specify the path to i18n-attr-repo.html
      };

      return gulp.src([ 'app/elements/**/*.html' ])
        .pipe(i18nPreprocess(options))
        .pipe(gulp.dest('dist/elements'));
    });
```

### Scan task

#### Note: Target HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs in source

#### Output: 
  - attributesRepository object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository = {};

    // Scan HTMLs and construct localizable attributes repository
    gulp.task('scan', function () {
      return gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          constructAttributesRepository: true, // construct attributes repository
          attributesRepository: attributesRepository, // output object
          srcPath: 'app', // path to source root
          attributesRepositoryPath: 
            'bower_components/i18n-behavior/i18n-attr-repo.html', // path to i18n-attr-repo.html
          dropHtml: true // drop HTMLs
        })) 
        .pipe(gulp.dest('dist/elements')); // no outputs; dummy output path
    });
```

### Preprocess task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs
  - Non-custom-element HTMLs in source

#### Output: 
  - Preprocessed HTMLs and default JSON files in dist

```javascript
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository; // constructed attributes repository

    // Other standard pipes such as crisper / minification / uglification are omitted for explanation
    gulp.task('preprocess', function () {
      var elements = gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          attributesRepository: attributesRepository // input attributes repository
        }))
        .pipe(gulp.dest('dist/elements')); // output preprocessed HTMLs and default JSON files to dist

      var html = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ]) // non-custom-element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          force: true, // force processing even without direct i18n-behavior.html import
          attributesRepository: attributesRepository // input attributes repository
         }))
        .pipe(gulp.dest('dist'));

      return merge(elements, html);
    });
```

### Leverage task with [gulp-i18n-leverage](https://github.com/t2ym/gulp-i18n-leverage)

#### Input:
  - Current localized JSON files in source
  - Current default JSON files in source
  - Next default JSON files in dist

#### Output:
  - Next localized JSON files in dist
  - Bundles object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nLeverage = require('gulp-i18n-leverage');

    var bundles = {};

    gulp.task('leverage', function () {
      return gulp.src([ 'app/**/locales/*.json' ]) // input localized JSON files in source
        .pipe(i18nLeverage({
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          distPath: 'dist', // path to dist root to fetch next default JSON files
          bundles: bundles // output bundles object
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Bundles task

#### Input: 
  - Bundles object in gulpfile.js

#### Output: 
  - Bundles JSON files in dist

```javascript
    var gulp = require('gulp');
    var fs = require('fs');
    var JSONstringify = require('json-stringify-safe');

    var bundles; // constructed bundles

    gulp.task('bundles', function (callback) {
      var DEST_DIR = 'dist';
      var localesPath = DEST_DIR + '/locales';

      try {
        fs.mkdirSync(localesPath);
      }
      catch (e) {}
      for (var lang in bundles) {
        bundles[lang].bundle = true;
        if (lang) {
          fs.writeFileSync(localesPath + '/bundle.' + lang + '.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
        else {
          fs.writeFileSync(DEST_DIR + '/bundle.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
      }
      callback();
    });
```

### Feedback task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input:
  - Next localized JSON files in dist
  - Custom element HTMLs
  - Non-custom-element HTMLs

#### Output:
  - Overwritten localized JSON files in source
  - Overwritten default JSON files in source

Outputs are ready to commit in the repository

```javascript
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Only applicable to development builds; Skip it in production builds
    gulp.task('feedback', function () {
      // Copy from dist
      var locales = gulp.src([ 'dist/**/locales/*.json', '!dist/locales/bundle.*.json'])
        .pipe(gulp.dest('app'));

      // Regenerate default JSON files
      var elementDefault = gulp.src([ 'app/elements/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app/elements'));

      // Regenerate default JSON files for non-custom-element HTMLs, i.e., i18n-dom-bind
      var appDefault = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          force: true,
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app'));

      return merge(locales, elementDefault, appDefault);
    });
```

### Integrate with Polymer CLI project templates by `polymer-build` library (highly experimental)

#### Notes:
  - As of [`polymer-build 0.4.0`](https://github.com/Polymer/polymer-build), `polymer-build` library is pre-release and subject to change.
  - As of [`Polymer CLI 0.13.0`](https://github.com/Polymer/polymer-cli), the private API `userTransformers` is deprecated and no longer available.

#### Set up `package.json` and the dependent packages of the following `gulpfile.js`

```sh
    npm init # if package.json is missing
    npm install --save-dev gulp gulp-debug gulp-grep-contents \
      gulp-i18n-add-locales gulp-i18n-leverage gulp-i18n-preprocess \
      gulp-if gulp-ignore gulp-match gulp-merge gulp-size gulp-sort gulp-util \
      json-stringify-safe strip-bom through2 xliff-conv polymer-build plylog merge-stream
```

#### Gulp Filters:
  - scan - Scan HTMLs and construct localizable attributes repository
  - basenameSort - Sort source files according to their base names; Bundle files come first.
  - dropDefaultJSON - Drop default JSON files to avoid overwriting new ones 
  - preprocess - Preprocess Polymer templates for I18N
  - tmpJSON - Store extracted JSON in the temporary folder .tmp
  - importXliff - Import XLIFF into JSON
  - leverage - Merge changes in default JSON into localized JSON
  - exportXliff - Generate bundles and export XLIFF
  - feedback - Update JSON and XLIFF in sources
  - debug - Show the list of processed files including untouched ones
  - size - Show the total size of the processed files

#### Gulp Tasks:
  - `gulp locales --targets="{space separated list of target locales}"`
  - `gulp default` - Build with `polymer-build` library for `gulp`

#### [gulpfile.js](https://gist.github.com/t2ym/c37990e422d4a19774ba1d749510c1b8#file-gulpfile-js): Put it in the root folder of the project
```javascript
    'use strict';

    var gulp = require('gulp');
    var gutil = require('gulp-util');
    var debug = require('gulp-debug');
    var gulpif = require('gulp-if');
    var gulpignore = require('gulp-ignore');
    var gulpmatch = require('gulp-match');
    var sort = require('gulp-sort');
    var grepContents = require('gulp-grep-contents');
    var size = require('gulp-size');
    var merge = require('gulp-merge');
    var through = require('through2');
    var path = require('path');
    var stripBom = require('strip-bom');
    var JSONstringify = require('json-stringify-safe');
    var i18nPreprocess = require('gulp-i18n-preprocess');
    var i18nLeverage = require('gulp-i18n-leverage');
    var XliffConv = require('xliff-conv');
    var i18nAddLocales = require('gulp-i18n-add-locales');

    const logging = require('plylog');
    const mergeStream = require('merge-stream');

    const isPolymerCLI = global._babelPolyfill;

    // Global object to store localizable attributes repository
    var attributesRepository = {};

    // Bundles object
    var prevBundles = {};
    var bundles = {};

    var title = 'I18N transform';
    var tmpDir = '.tmp';

    var xliffOptions = {};

    // Scan HTMLs and construct localizable attributes repository
    var scan = gulpif('*.html', i18nPreprocess({
      constructAttributesRepository: true, // construct attributes repository
      attributesRepository: attributesRepository, // output object
      srcPath: '.', // path to source root
      attributesRepositoryPath: 
        'bower_components/i18n-behavior/i18n-attr-repo.html', // path to i18n-attr-repo.html
      dropHtml: false // do not drop HTMLs
    }));

    var basenameSort = sort({
      comparator: function(file1, file2) {
        var base1 = path.basename(file1.path).replace(/^bundle[.]/, ' bundle.');
        var base2 = path.basename(file2.path).replace(/^bundle[.]/, ' bundle.');
        return base1.localeCompare(base2);
      }
    });

    var dropDefaultJSON = gulpignore([ 'src/**/*.json', '!**/locales/*.json' ]);

    var preprocess = gulpif('*.html', i18nPreprocess({
      replacingText: true, // replace UI texts with {{annotations}}
      jsonSpace: 2, // JSON format with 2 spaces
      srcPath: '.', // path to source root
      attributesRepository: attributesRepository // input attributes repository
    }));

    var tmpJSON = gulpif([ 'src/**/*.json', '!src/**/locales/*' ], gulp.dest(tmpDir));

    var unbundleFiles = [];
    var importXliff = through.obj(function (file, enc, callback) {
      // bundle files must come earlier
      unbundleFiles.push(file);
      callback();
    }, function (callback) {
      var match;
      var file;
      var bundleFileMap = {};
      var xliffConv = new XliffConv(xliffOptions);
      while (unbundleFiles.length > 0) {
        file = unbundleFiles.shift();
        if (path.basename(file.path).match(/^bundle[.]json$/)) {
          prevBundles[''] = JSON.parse(stripBom(String(file.contents)));
          bundleFileMap[''] = file;
        }
        else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]json$/)) {
          prevBundles[match[1]] = JSON.parse(stripBom(String(file.contents)));
          bundleFileMap[match[1]] = file;
        }
        else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]xlf$/)) {
          xliffConv.parseXliff(String(file.contents), { bundle: prevBundles[match[1]] }, function (output) {
            if (bundleFileMap[match[1]]) {
              bundleFileMap[match[1]].contents = new Buffer(JSONstringify(output, null, 2));
            }
          });
        }
        else if (gulpmatch(file, '**/locales/*.json') &&
                 (match = path.basename(file.path, '.json').match(/^([^.]*)[.]([^.]*)/))) {
          if (prevBundles[match[2]] && prevBundles[match[2]][match[1]]) {
            file.contents = new Buffer(JSONstringify(prevBundles[match[2]][match[1]], null, 2));
          }
        }
        this.push(file);
      }
      callback();
    });

    var leverage = gulpif([ 'src/**/locales/*.json', '!**/locales/bundle.*.json' ], i18nLeverage({
      jsonSpace: 2, // JSON format with 2 spaces
      srcPath: '', // path to source root
      distPath: '/' + tmpDir, // path to dist root to fetch next default JSON files
      bundles: bundles // output bundles object
    }));

    var bundleFiles = [];
    var exportXliff = through.obj(function (file, enc, callback) {
      bundleFiles.push(file);
      callback();
    }, function (callback) {
      var file;
      var cwd = bundleFiles[0].cwd;
      var base = bundleFiles[0].base;
      var xliffConv = new XliffConv(xliffOptions);
      var srcLanguage = 'en';
      var promises = [];
      var self = this;
      var lang;
      while (bundleFiles.length > 0) {
        file = bundleFiles.shift();
        if (!gulpmatch(file, [ '**/bundle.json', '**/locales/bundle.*.json', '**/xliff/bundle.*.xlf' ])) {
          this.push(file);
        }
      }
      for (lang in bundles) {
        bundles[lang].bundle = true;
        this.push(new gutil.File({
          cwd: cwd,
          base: base,
          path: lang ? path.join(cwd, 'locales', 'bundle.' + lang + '.json')
                     : path.join(cwd, 'bundle.json'),
          contents: new Buffer(JSONstringify(bundles[lang], null, 2))
        }));
      }
      for (lang in bundles) {
        if (lang) {
          (function (destLanguage) {
            promises.push(new Promise(function (resolve, reject) {
              xliffConv.parseJSON(bundles, {
                srcLanguage: srcLanguage,
                destLanguage: destLanguage
              }, function (output) {
                self.push(new gutil.File({
                  cwd: cwd,
                  base: base,
                  path: path.join(cwd, 'xliff', 'bundle.' + destLanguage + '.xlf'),
                  contents: new Buffer(output)
                }));
                resolve();
              });
            }));
          })(lang);
        }
      }
      Promise.all(promises).then(function (outputs) {
        callback();
      });
    });

    var feedback = gulpif([ '**/bundle.json', '**/locales/*.json', '**/src/**/*.json', '**/xliff/bundle.*.xlf' ], gulp.dest('.'));

    var config = {
      // list of target locales to add
      locales: gutil.env.targets ? gutil.env.targets.split(/ /) : []
    }

    // Gulp task to add locales to I18N-ready elements and pages
    // Usage: gulp locales --targets="{space separated list of target locales}"
    gulp.task('locales', function() {
      var elements = gulp.src([ 'src/**/*.html' ], { base: '.' })
        .pipe(grepContents(/i18n-behavior.html/))
        .pipe(grepContents(/<dom-module /));

      var pages = gulp.src([ 'index.html' ], { base: '.' })
        .pipe(grepContents(/is=['"]i18n-dom-bind['"]/));

      return merge(elements, pages)
        .pipe(i18nAddLocales(config.locales))
        .pipe(gulp.dest('.'))
        .pipe(debug({ title: 'Add locales:'}))
    });

    if (isPolymerCLI) {
      module.exports = {
        transformers: [
          scan,
          basenameSort,
          dropDefaultJSON,
          preprocess,
          tmpJSON,
          importXliff,
          leverage,
          exportXliff,
          feedback,
          debug({ title: title }),
          size({ title: title })
        ]
      };
    }
    else {
      const polymer = require('polymer-build');
      //const optimize = require('polymer-build/lib/optimize').optimize;
      //const precache = require('polymer-build/lib/sw-precache');
      const PolymerProject = polymer.PolymerProject;
      const fork = polymer.forkStream;
      const polymerConfig = require('./polymer.json');

      //logging.setVerbose();

      let project = new PolymerProject({
        root: process.cwd(),
        entrypoint: polymerConfig.entrypoint,
        shell: polymerConfig.shell
      });

      gulp.task('default', () => {
        // process source files in the project
        let sources = project.sources()
          .pipe(project.splitHtml())
          // I18N processes
          .pipe(scan)
          .pipe(basenameSort)
          .pipe(dropDefaultJSON)
          .pipe(preprocess)
          .pipe(tmpJSON)
          .pipe(importXliff)
          .pipe(leverage)
          .pipe(exportXliff)
          .pipe(feedback)
          .pipe(debug({ title: title }))
          .pipe(size({ title: title }))
          // add compilers or optimizers here!
          .pipe(project.rejoinHtml());

        // process dependencies
        let dependencies = project.dependencies()
          .pipe(project.splitHtml())
          // add compilers or optimizers here!
          .pipe(project.rejoinHtml());

        // merge the source and dependencies streams to we can analyze the project
        let allFiles = mergeStream(sources, dependencies)
          .pipe(project.analyze);

        // fork the stream in case downstream transformers mutate the files
        // this fork will vulcanize the project
        let bundled = fork(allFiles)
          .pipe(project.bundle)
          // write to the bundled folder
          .pipe(gulp.dest('build/bundled'));

        let unbundled = fork(allFiles)
          // write to the unbundled folder
          .pipe(gulp.dest('build/unbundled'));

        return mergeStream(bundled, unbundled);
      });
    }
```

## API

`i18nPreprocess(options)`

### `options` object

- replacingText: Boolean, default: false - If true, UI texts are replaced with {{annotations}}
- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- force: Boolean, default: false - Force preprocessing even if i18n-behavior.html is not imported
- dropHtml: Boolean, default: false - If true, drop the preprocessed HTML for output
- dropJson: Boolean, default: false - If true, drop the extracted JSON files for output
- constructAttributesRepository: Boolean, default: false - If true, construct localizable attributes repository
- attributesRepository: Object, default: {} - Input/Output - attributes respository object
- attributesRepositoryPath: String, default: null - Path to bower_components/i18n-behavior/i18n-attr-repo.html

## Quick Tour

### Quick deployment of [`polymer-starter-kit-i18n`](https://github.com/t2ym/polymer-starter-kit-i18n)

```
    git clone https://github.com/t2ym/polymer-starter-kit-i18n.git
    cd polymer-starter-kit-i18n
    npm install -g polymer-cli # if missing
    npm install && bower install
    # Add Locales
    npm run build locales -- --targets="de es fr ja zh-Hans"
    # Build
    npm run build
    # Translate XLIFF ./xliff/bundle.*.xlf
    # Build and Merge Translation
    npm run build
    # App with Run-time I18N on http://localhost:8080
    polymer serve
    # App with Build-time I18N on http://localhost:8080
    polymer serve build/bundled
```

### Change language

##### 1. Press F12 to open debugger console on the browser

##### 2. Navigate to the elements or DOM tab in the debugger

##### 3. Change `lang` attribute of `html` element from "en" to other locales such as "ja"

```
    <html lang="ja">
```

### Update UI strings

##### 1. Change any UI strings in the following HTMLs

```
    polymer-starter-kit-i18n/src/*.html
```

##### 2. Merge changes into JSON files

```
    cd polymer-starter-kit-i18n
    npm run build
```

##### 3. Check diffs

```
    git diff
```

## License

[BSD-2-Clause](https://github.com/t2ym/gulp-i18n-preprocess/blob/master/LICENSE.md)
