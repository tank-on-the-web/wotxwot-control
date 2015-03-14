(function(){

  const ATTEMPTS = 100;

  var normalizeAxis = function(value){
    return Math.min(Math.max(Math.floor(value * 100), -100), 100);
  };

  var Pad = function(){
    this.initialize.apply(this, arguments);
  };

  Pad.prototype = {
    initialize: function(pad){
      this._pad = pad;
      this._axesBaseLine = pad.axes.map(() =>{
        return 0;
      });
    },
    calibrate: function(){
      return new Promise((resolve, reject) => {
        var buf = [];
        for(var i = 0; i < ATTEMPTS; i++){
          for(var j = 0; j < this.pad.axes.length; j++){
            buf[j] = (buf[j] || 0) + this.pad.axes[j];
          }
        }
        this._axesBaseLine =  buf.map(value => {
          return value / ATTEMPTS;
        });
        resolve(this);
      });
    },
    get id(){
      return this.pad.id;
    },
    get axes(){
      var ret = [];
      for(var i = 0; i < this.pad.axes.length; i++){
        ret[i] = normalizeAxis(this.pad.axes[i] - (this._axesBaseLine[i] || 0));
      }
      return ret;
    },
    get pad(){
      return this._pad;
    },
    get rightStick(){
      return {
        x: this.axes[2],
        y: this.axes[3]
      };      
    },
    get leftStick(){
      return {
        x: this.axes[0],
        y: this.axes[1]
      };
    }
  };

  module.exports = Pad;

})();
