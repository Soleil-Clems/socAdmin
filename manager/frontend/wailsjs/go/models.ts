export namespace main {
	
	export class AppConfig {
	    port: number;
	    autoStart: boolean;
	    openOnStart: boolean;
	    mysqlPort: number;
	    pgPort: number;
	    mongoPort: number;
	    projectDir: string;
	
	    static createFrom(source: any = {}) {
	        return new AppConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.port = source["port"];
	        this.autoStart = source["autoStart"];
	        this.openOnStart = source["openOnStart"];
	        this.mysqlPort = source["mysqlPort"];
	        this.pgPort = source["pgPort"];
	        this.mongoPort = source["mongoPort"];
	        this.projectDir = source["projectDir"];
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
	export class ServiceStatus {
	    name: string;
	    running: boolean;
	    installed: boolean;
	    version: string;
	    port: number;
	    pid: number;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new ServiceStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.running = source["running"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.port = source["port"];
	        this.pid = source["pid"];
	        this.path = source["path"];
	    }
	}

}

