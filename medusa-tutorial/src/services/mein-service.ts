class MeinPluginService {
    container: any;
    constructor(container: any)
    {
        this.container = container;
        console.log("MeinPluginService wurde initialisiert");
    }

    async meineMethode()
    {
        //Plugin-Logik hier
        console.log("meineMethode wurde aufgerufen");
    }

}

export default MeinPluginService;