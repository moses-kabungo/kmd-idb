(function (global) {
  System.config({
    paths: {
      // paths serve as alias
      'npm:': 'node_modules/'
    },
    // map tells the System loader where to look for things
    map: {
      root: '/'
      // angular bundles
      '@angular/core': 'npm:@angular/core/bundles/core.umd.js',

      // other libraries
      // 'rxjs':   'npm:rxjs',
      'lodash': 'npm:lodash/lodash.js'
    },

    packages: {
      root: {
        defaultExtension: 'js'
      }
    }
  });
})(this);