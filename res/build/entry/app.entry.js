webpackJsonp([5],{

/***/ 6:
/***/ (function(module, exports, __webpack_require__) {

/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

__webpack_require__.e/* require.ensure */(0).then((function(require) {
  __webpack_require__(0)
  __webpack_require__(2)
  __webpack_require__(3)

  angular.module('app', [
    'ngRoute',
    'ngTouch',
    __webpack_require__(1).name,
    __webpack_require__(9).name,
    __webpack_require__(11).name,
    __webpack_require__(12).name,
    __webpack_require__(5).name,
    __webpack_require__(13).name,
    __webpack_require__(14).name,
    __webpack_require__(15).name,
    __webpack_require__(16).name,
    __webpack_require__(17).name,
    __webpack_require__(18).name,
    __webpack_require__(10).name,
    __webpack_require__(5).name
  ])
    .config(function($routeProvider, $locationProvider) {
      $locationProvider.hashPrefix('!')
      $routeProvider
        .otherwise({
          redirectTo: '/devices'
        })
    })

    .config(function(hotkeysProvider) {
      hotkeysProvider.templateTitle = 'Keyboard Shortcuts:'
    })
}).bind(null, __webpack_require__)).catch(__webpack_require__.oe)


/***/ })

},[6]);