export namespace main {
	
	export class AppConfig {
	    port: number;
	    autoStart: boolean;
	    openOnStart: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.port = source["port"];
	        this.autoStart = source["autoStart"];
	        this.openOnStart = source["openOnStart"];
	    }
	}
	export class SGBDInfo {
	    name: string;
	    installed: boolean;
	    version: string;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new SGBDInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.path = source["path"];
	    }
	}
	export class ServerStatus {
	    running: boolean;
	    port: number;
	    pid: number;
	    uptime: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.port = source["port"];
	        this.pid = source["pid"];
	        this.uptime = source["uptime"];
	        this.url = source["url"];
	    }
	}

}

