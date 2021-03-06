(function(){
  const SERVER_KEY = "server_ip";
  const INTERVAL = 200;

  var Logger = require("./logger");
  var Pad = require("./pad");
  var Driver = require("./driver");
  var TankView = require("./tank-view");

  var app = {};

  var log = function(text){
    if(app.logger){
      app.logger.log(text);
    }else{
      console.log(text);
    }
  };

  var createTankView = function(pad){
    var left = document.querySelector("#left");
    var right = document.querySelector("#right");
    return new TankView(pad, left, right);
  };

  var padConnected = function(event){
    var pad = event.gamepad;
    if(!app.pad){
      log(pad.id + "connected");
      app.pad = new Pad(pad);
      app.tankView = createTankView(app.pad);

      app.pad.calibrate().then(() =>{
        app.driver = new Driver(app.url,
                                app.pad,
                                INTERVAL,
                                log);
        app.driver.start();
        app.tankView.start();
      });
    }
  };

  var padDisconnected = function(event){
    app.pad = null;
  };

  var onServerChanged = function(event){
    var server = app.serverInput.value;
    app.url = server;
    window.localStorage.setItem(SERVER_KEY, server);
    if (app.driver) {
      app.driver.restart(app.url);
    }
  };

  window.addEventListener("load", function(){
    var server = (window.localStorage.getItem(SERVER_KEY) || "ws://192.168.1.1/ws");
    app.url = server;
    app.serverInput = document.querySelector("#server");
    app.serverInput.value = server;
    app.serverInput.onchange = onServerChanged;

    app.logger = new Logger(document.querySelector("#log"));

    document.getElementById('open-tank-view').onclick = function () {
      var tankView = document.getElementById('tank-view');
      var ctrlView = document.getElementById('ctrl-view');
      tankView.style.display = 'block';
      ctrlView.style.display = 'none';

      var url = document.createElement('a');
      var iframe = tankView.querySelector('iframe');
      url.href = app.url;
      iframe.src = 'http://' + url.hostname + ':7080';
      document.addEventListener('keydown', function onKeyDown(evt) {
        if (evt.key === 'Enter')
        // close it!
        iframe.src = '';
        tankView.style.display = 'none';
        ctrlView.style.display = 'block';
        document.removeEventListener('keydown', onKeyDown);
      });
    }

    log("app started");
    window.addEventListener("gamepadconnected", 
                            padConnected);
    window.addEventListener("gamepaddisconnected", 
                            padDisconnected);
  });

  window.addEventListener("unload", function(){
    if(app.driver){
      app.driver.stop();
    }
  });
  
})();
