webpackJsonp([4],{

/***/ 7:
/***/ (function(module, exports, __webpack_require__) {

__webpack_require__.e/* require.ensure */(2).then((function(require) {
  __webpack_require__(4)

  __webpack_require__(0)
  __webpack_require__(2)
  __webpack_require__(3)

  angular.module('app', [
    'ngRoute',
    'ngTouch',
    __webpack_require__(1).name,
    __webpack_require__(19).name
  ])
    .config(function($routeProvider, $locationProvider) {
      $locationProvider.html5Mode(true)
      $routeProvider
        .otherwise({
          redirectTo: '/auth/ldap/'
        })
    })

}).bind(null, __webpack_require__)).catch(__webpack_require__.oe)


/***/ })

},[7]);