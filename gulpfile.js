var gulp = require("gulp");
var app = require("./server/server");
var jshint = require("gulp-jshint");

// start-server：サーバの起動タスク
gulp.task("start-server", function() {
  var server = app.create({
    port:8080,
    documentRoot: "./app"
  });
  server.start();
});

gulp.task("build", function(){
  
  var browserify = require( 'browserify' );
  var source     = require( 'vinyl-source-stream' );
  browserify( './app/js/main.js', { debug: true } )
    .bundle()
    .pipe( source( 'app.js' ) )
    .pipe( gulp.dest( './app/js' ));  

});

// lint：JavaScriptの文法チェックを行うタスク
gulp.task("lint", function () {
  return gulp.src(["app/js/**/*.js", "server/**/*.js"])
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'));
});

// watch：ファイルの変更を監視して list を起動
gulp.task("watch",function(){
  gulp.watch(["app/js/**/*.js", "server/**/*.js"], ["lint", "build"]);
});

// デフォルトのタスクを指定
gulp.task("default", ["start-server", "watch"]);
