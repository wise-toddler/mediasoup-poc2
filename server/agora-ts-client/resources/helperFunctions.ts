import WebSocket from "ws";
import mediasoup from "mediasoup-client";
import AgoraRTC, { IAgoraRTCRemoteUser } from "agora-rtc-sdk-ng";
import { APP_ID, CHANNEL, TOKEN } from "../config";


const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
const webSocketURL = 'ws://localhost:8000/ws';
const useCallBackArrOnConnect = [];
const useCallBackArrOnProduce = {};
let socket: WebSocket;
let device: mediasoup.Device;
let sendTransport: mediasoup.types.Transport;

function send(ws: WebSocket, type: string, obj: any) {
    ws.send(JSON.stringify({ type, data: obj }));
}

function createSocketConnection() {
    socket = new WebSocket(webSocketURL);
    socket.onerror = (error) => {
        console.error('failed to connect to server', error);
    };
}

async function loadDeviceWithRouterCapabilities(routerRtpCapabilities: any) {
    console.log('Loading device with router capabilities');
    device = new mediasoup.Device();
    // if failed to load device, throw error
    try {
        await device.load({ routerRtpCapabilities });
    }
    catch (error) {
        console.error('failed to load device', error);
    }
    console.log('Device loaded');

}

async function handleUserTrackPublished(user: IAgoraRTCRemoteUser, mediaType: any) {
    console.log('Track published');

    await client.subscribe(user, mediaType);
    let subscriptionArray = client['_p2pChannel'].store.state.keyMetrics.subscribe;
    // console.log(subscriptionArray);
    let subscription = subscriptionArray.find((obj: any) => obj.userId === user.uid && obj.type === mediaType);

    if (subscription.producerId !== undefined) {
        send(socket, 'resumeProducer', { producerUserId: user.uid, producerId: subscription.producerId });
    }

    else {
        let producerId = crypto.randomUUID();
        await sendTransport.produce({
            track: user[`${mediaType}Track`].getMediaStreamTrack(),
            appData: { producerId, userId: user.uid }
        });
        subscription.producerId = producerId;
    }
}

async function handleUserTrackUnpublished(user: IAgoraRTCRemoteUser, mediaType: any) {
    console.log('Track unpublished');
    let subscriptionArray = client['_p2pChannel'].store.state.keyMetrics.subscribe;
    let subscription = subscriptionArray.find((obj: any) => obj.userId === user.uid && obj.type === mediaType);
    await client.unsubscribe(user, mediaType);
    send(socket, 'pauseProducer', { producerUserId: user.uid, producerId: subscription.producerId });
}

async function createProducerTransport(transportParams: any) {
    sendTransport = device.createSendTransport(transportParams);
    // when local transport is connected, send the dtlsParameters to server
    sendTransport.on('connect', async ({ dtlsParameters, }, callback) => {
        useCallBackArrOnConnect.push(callback);
        send(socket, 'connectProducerTransport', { dtlsParameters, callBackId: useCallBackArrOnConnect.length });
    });

    // when local transport produces a track
    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback) => {
        // send a msg to server to create a corresponding producer
        useCallBackArrOnProduce[appData.userId as string] = callback;
        send(socket, 'createProducer', { id: appData.producerId, userId: appData.userId, kind, rtpParameters });
    });

    // when local transport is changed
    sendTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connected':
                console.log('Producer transport connected');
                break;
            case 'disconnected':
                console.log('Producer transport disconnected');
                break;
            case 'failed':
                sendTransport.close();
                console.log('Producer transport failed');
                break;
            default:
                console.log('Producer transport state changed to', state);
                break;
        }
    });

    client.on('user-published', handleUserTrackPublished);
    client.on('user-unpublished', handleUserTrackUnpublished);
    await client.join(APP_ID, CHANNEL, TOKEN, null);
}

export { 
    send, 
    createSocketConnection, 
    loadDeviceWithRouterCapabilities, 
    createProducerTransport, 
    socket, 
    device, 
    sendTransport,
    useCallBackArrOnConnect,
    useCallBackArrOnProduce
};