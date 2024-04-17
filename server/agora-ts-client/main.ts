import { 
    createSocketConnection, 
    loadDeviceWithRouterCapabilities, 
    createProducerTransport, 
    socket, 
    send, 
    useCallBackArrOnConnect, 
    useCallBackArrOnProduce 
} from './resources/helperFunctions';
createSocketConnection();
socket.onopen = () => 
{
    console.log('WebSocket connection opened');
    send(socket, 'getRouterRtpCapabilities', {});
}
socket.onmessage = async (event: any) =>
{
    const messageFromServer = JSON.parse(event.data);
    switch(messageFromServer.type)
    {
        case 'routerRtpCapabilities':
            console.log('Router RTP capabilities received');
            await loadDeviceWithRouterCapabilities(messageFromServer.data);
            send(socket, 'createProducerTransportOnServer', {forceTcp: false}); 
            break;
        case 'createProducerTransport':
            console.log('Creating producer transport');
            await createProducerTransport(messageFromServer.data);
            break;
        case 'producerTransportConnected':
            console.log('Producer transport connected');
            useCallBackArrOnConnect[messageFromServer.data]();
            break;
        case 'producerCreated':
            console.log('Producer created');
            useCallBackArrOnProduce[messageFromServer.data.producerUserId]({ id: messageFromServer.data.producerId });
            break;
        default:
            console.log('Unknown message type');
            break;
    }
} 
socket.onclose = () =>
{
    console.log('WebSocket connection closed');
}
