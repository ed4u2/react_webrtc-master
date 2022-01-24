import React, {useRef,useEffect} from 'react';
import VideoCall from '../helpers/simple-peer';
import '../styles/video.css';
import io from 'socket.io-client';
import { getDisplayStream } from '../helpers/media-access';
import {ShareScreenIcon,MicOnIcon,MicOffIcon,CamOnIcon,CamOffIcon} from './Icons'; 
import * as tf from '@tensorflow/tfjs';
import {loadGraphModel} from '@tensorflow/tfjs-converter';
tf.setBackend('webgl');

const threshold = 0.60;

async function load_model() {
    // It's possible to load the model locally or from a repo
    // You can choose whatever IP and PORT you want in the "http://127.0.0.1:8080/model.json" just set it before in your https server
    //const model = await loadGraphModel("http://127.0.0.1:8080/model.json");
    const model = await loadGraphModel("https://raw.githubusercontent.com/ed4u2/cpe-objectdetection/master/models/my_efficientdet_d1/model.json");
    return model;
  }

let classesDir = {
    1: {
        name: 'hand',
        id: 1,
    },
    2: {
        name: 'face',
        id: 2,
    },
    3: {
      name: 'tvmonitor',
      id: 3,
  }
}

class Video extends React.Component {
  constructor() {
    super();
    this.state = {
      localStream: {},
      remoteStreamUrl: '',
      streamUrl: '',
      initiator: false,
      peer: {},
      full: false,
      connecting: false,
      waiting: true,
      micState:true,
      camState:true,
      time : 10,
    };
  }
  
  canvasRef = React.createRef();
  remoteVideo = React.createRef();
  videoCall = new VideoCall();

  componentDidMount() {
    const socket = io(process.env.REACT_APP_SIGNALING_SERVER);
    const component = this;
    this.setState({ socket });
    const { roomId } = this.props.match.params;
    this.getUserMedia().then(() => {
      socket.emit('join', { roomId: roomId });
    });

    socket.on('init', () => {
      component.setState({ initiator: true });
    });
    socket.on('ready', () => {
      component.enter(roomId);
    });
    socket.on('desc', data => {
      if (data.type === 'offer' && component.state.initiator) return;
      if (data.type === 'answer' && !component.state.initiator) return;
      component.call(data);
    });
    socket.on('disconnected', () => {
      component.setState({ initiator: true });
    });
    socket.on('full', () => {
      component.setState({ full: true });
    });

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const webCamPromise = navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: "user"
        }
      })
      .then(stream => {
        window.stream = stream;
        this.remoteVideo.srcObject = stream;
        return new Promise((resolve, reject) => {
          this.remoteVideo.onloadedmetadata = () => {
            resolve();
          };
        });
      });

      const modelPromise = load_model();
      
      Promise.all([modelPromise, webCamPromise])
      .then(values => {
        this.detectFrame(this.remoteVideo, values[0]);
      })
      .catch(error => {
        console.error(error);
      });
    }

    this.setInterval = setInterval(this.elapseTime.bind(this),1000)
    this.setState({start: new Date()});

  }

    elapseTime(){
      // 確認完畢觸發「開始計時」
      var currentTime = new Date();
      console.log("CURRENT" + currentTime);
      console.log(this.state.start);
  }


    detectFrame = (video, model) => {
      tf.engine().startScope();
      model.executeAsync(this.process_input(video)).then(predictions => {this.renderPredictions(predictions, video);
      requestAnimationFrame(() => {
        this.detectFrame(video, model);
      });
      tf.engine().endScope();
    });
  };

  process_input(video_frame){
    const tfimg = tf.browser.fromPixels(video_frame).toInt();
    const expandedimg = tfimg.transpose([0,1,2]).expandDims();
    return expandedimg;
  };

  buildDetectedObjects(scores, threshold, boxes, classes, classesDir) {
    const detectionObjects = []
    var video_frame = document.getElementById('remoteVideo');

    scores[0].forEach((score, i) => {
      if (score > threshold) {
        const bbox = [];
        const minY = boxes[0][i][0] * video_frame.offsetHeight;
        const minX = boxes[0][i][1] * video_frame.offsetWidth;
        const maxY = boxes[0][i][2] * video_frame.offsetHeight;
        const maxX = boxes[0][i][3] * video_frame.offsetWidth;
        bbox[0] = minX;
        bbox[1] = minY;
        bbox[2] = maxX - minX;
        bbox[3] = maxY - minY;
        detectionObjects.push({
          class: classes[i],
          label: classesDir[classes[i]].name,
          score: score.toFixed(4),
          bbox: bbox
        })
      }
    })
    return detectionObjects
  }

  renderPredictions = predictions => {
    const ctx = this.canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // 

    const ctxctx = this.canvasRef.current.getContext("2d");
    ctxctx.font="20px Georgia";


    // Font options.
    const font = "16px sans-serif";
    ctx.font = font;
    ctx.textBaseline = "top";

    //Getting predictions
    const boxes = predictions[2].arraySync();
    const scores = predictions[7].arraySync();
    const classes = predictions[4].dataSync();
    const detections = this.buildDetectedObjects(scores, threshold,
                                    boxes, classes, classesDir);

    detections.forEach(item => {
      const x = item['bbox'][0];
      const y = item['bbox'][1];
      const width = item['bbox'][2];
      const height = item['bbox'][3];

      // Draw the bounding box.
      ctx.strokeStyle = "#00FFFF";
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y , width, height -50);

      // Draw the label background.
      ctx.fillStyle = "#00FFFF";
      const textWidth = ctx.measureText(item["label"] + " " + (100 * item["score"]).toFixed(2) + "%").width;
      const textHeight = parseInt(font, 10); // base 10
      ctx.fillRect(x, y , textWidth + 4, textHeight + 4);

      //check
      ctxctx.fillStyle = "#00ff00";
      ctxctx.fillText("check :" + classesDir[classes[1]].name + classesDir[classes[2]].name + classesDir[classes[3]].name,0,200);
    });

    detections.forEach(item => {
      const x = item['bbox'][0];
      const y = item['bbox'][1];

      // Draw the text last to ensure it's on top.
      ctx.fillStyle = "#000000";
      ctx.fillText(item["label"] + " " + (100*item["score"]).toFixed(2) + "%", x, y );
    });
  };

  

  getUserMedia(cb) {
    return new Promise((resolve, reject) => {
      navigator.getUserMedia = navigator.getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia;
      const op = {
        video: {
          width: { min: 160, ideal: 640, max: 1280 },
          height: { min: 120, ideal: 360, max: 720 }
        },
        audio: false
      };
      navigator.getUserMedia(
        op,
        stream => {
          this.setState({ streamUrl: stream, localStream: stream });
          this.localVideo.srcObject = stream;
          resolve();
        },
        () => {}
      );
    });
  }

  setAudioLocal(){
    if(this.state.localStream.getAudioTracks().length>0){
      this.state.localStream.getAudioTracks().forEach(track => {
        track.enabled=!track.enabled;
      });
    }
    this.setState({
      micState:!this.state.micState
    })
  }

  setVideoLocal(){
    if(this.state.localStream.getVideoTracks().length>0){
      this.state.localStream.getVideoTracks().forEach(track => {
        track.enabled=!track.enabled;
      });
    }
    this.setState({
      camState:!this.state.camState
    })
  }

  getDisplay() {
    getDisplayStream().then(stream => {
      stream.oninactive = () => {
        this.state.peer.removeStream(this.state.localStream);
        this.getUserMedia().then(() => {
          this.state.peer.addStream(this.state.localStream);
        });
      };
      this.setState({ streamUrl: stream, localStream: stream });
      this.localVideo.srcObject = stream;
      this.state.peer.addStream(stream);
    });
  }

  enter = roomId => {
    this.setState({ connecting: true });
    const peer = this.videoCall.init(
      this.state.localStream,
      this.state.initiator
    );
    this.setState({ peer });

    peer.on('signal', data => {
      const signal = {
        room: roomId,
        desc: data
      };
      this.state.socket.emit('signal', signal);
    });
    peer.on('stream', stream => {
      this.remoteVideo.srcObject = stream;
      this.setState({ connecting: false, waiting: false });
    });
    peer.on('error', function(err) {
      console.log(err);
    });
  };

  call = otherId => {
    this.videoCall.connect(otherId);
  };
  renderFull = () => {
    if (this.state.full) {
      return 'The room is full';
    }
  };



  render() {
    return (
      <div className='video-wrapper'>
        <div className='local-video-wrapper'>
          <video autoPlay id='localVideo' muted ref={video => (this.localVideo = video)} />
        </div>
        <video autoPlay className={`${ this.state.connecting || this.state.waiting ? 'hide' : '' }`} id='remoteVideo' ref={video => (this.remoteVideo = video)} />

        <canvas className="size"  ref={this.canvasRef} height="1000" width="1200" ></canvas>

        <div className='controls'>
        <button
          className='control-btn'
          onClick={() => {
            this.getDisplay();
          }}
        >
          <ShareScreenIcon />
        </button>


        <button
        className='control-btn'
          onClick={() => {
            this.setAudioLocal();
          }}
        >
          {
            this.state.micState?(
              <MicOnIcon/>
            ):(
              <MicOffIcon/>
            )
          }
        </button>

        <button
        className='control-btn'
          onClick={() => {
            this.setVideoLocal();
          }}
        >
          {
            this.state.camState?(
              <CamOnIcon/>
            ):(
              <CamOffIcon/>
            )
          }
        </button>
        </div>
        


        {this.state.connecting && (
          <div className='status'>
            <p>Establishing connection...</p>
          </div>
        )}
        {this.state.waiting && (
          <div className='status'>
            <p>Waiting for someone...</p>
          </div>
        )}
        {this.renderFull()}
      </div>
    );
  }
}

export default Video;
