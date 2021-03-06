import {
  Element,
  TestElement,
  HashTree,
  TestPlan,
  ThreadGroup,
  HeaderManager,
  HTTPSamplerProxy,
  HTTPSamplerArguments,
  Arguments,
  DurationAssertion,
  ResponseCodeAssertion,
  ResponseDataAssertion,
  ResponseHeadersAssertion,
  RegexExtractor, JSONPostProcessor, XPath2Extractor, DubboSample,
} from "./JMX";

export const uuid = function () {
  let d = new Date().getTime()
  let d2 = (performance && performance.now && (performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export const BODY_TYPE = {
  KV: "KeyValue",
  FORM_DATA: "Form Data",
  RAW: "Raw"
}

export const BODY_FORMAT = {
  TEXT: "text",
  JSON: "json",
  XML: "xml",
  HTML: "html",
}

export const ASSERTION_TYPE = {
  TEXT: "Text",
  REGEX: "Regex",
  DURATION: "Duration"
}

export const ASSERTION_REGEX_SUBJECT = {
  RESPONSE_CODE: "Response Code",
  RESPONSE_HEADERS: "Response Headers",
  RESPONSE_DATA: "Response Data"
}

export const EXTRACT_TYPE = {
  REGEX: "Regex",
  JSON_PATH: "JSONPath",
  XPATH: "XPath"
}

export class BaseConfig {

  set(options) {
    options = this.initOptions(options)

    for (let name in options) {
      if (options.hasOwnProperty(name)) {
        if (!(this[name] instanceof Array)) {
          this[name] = options[name];
        }
      }
    }
  }

  sets(types, options) {
    options = this.initOptions(options)
    if (types) {
      for (let name in types) {
        if (types.hasOwnProperty(name) && options.hasOwnProperty(name)) {
          options[name].forEach(o => {
            this[name].push(new types[name](o));
          })
        }
      }
    }
  }

  initOptions(options) {
    return options || {};
  }

  isValid() {
    return true;
  }
}

export class Test extends BaseConfig {
  constructor(options) {
    super();
    this.type = "MS API CONFIG";
    this.version = '1.1.0';
    this.id = uuid();
    this.name = undefined;
    this.projectId = undefined;
    this.scenarioDefinition = [];
    this.schedule = {};

    this.set(options);
    this.sets({scenarioDefinition: Scenario}, options);
  }

  export() {
    let obj = {
      type: this.type,
      version: this.version,
      scenarios: this.scenarioDefinition
    };

    return JSON.stringify(obj);
  }

  initOptions(options) {
    options = options || {};
    options.scenarioDefinition = options.scenarioDefinition || [new Scenario()];
    return options;
  }

  isValid() {
    for (let i = 0; i < this.scenarioDefinition.length; i++) {
      let validator = this.scenarioDefinition[i].isValid();
      if (!validator.isValid) {
        return validator;
      }
    }
    if (!this.projectId) {
      return {
        isValid: false,
        info: 'api_test.select_project'
      }
    } else if (!this.name) {
      return {
        isValid: false,
        info: 'api_test.input_name'
      }
    }
    return {isValid: true};
  }

  toJMX() {
    return {
      name: this.name + '.jmx',
      xml: new JMXGenerator(this).toXML()
    };
  }
}

export class Scenario extends BaseConfig {
  constructor(options = {}) {
    super();
    this.name = undefined;
    this.url = undefined;
    this.variables = [];
    this.headers = [];
    this.requests = [];
    this.environmentId = undefined;
    this.dubboConfig = undefined;
    this.environment = undefined;

    this.set(options);
    this.sets({variables: KeyValue, headers: KeyValue, requests: RequestFactory}, options);
  }

  initOptions(options) {
    options = options || {};
    options.requests = options.requests || [new RequestFactory()];
    options.dubboConfig = new DubboConfig(options.dubboConfig);
    return options;
  }

  clone() {
    return new Scenario(this);
  }

  isValid() {
    for (let i = 0; i < this.requests.length; i++) {
      let validator = this.requests[i].isValid(this.environmentId);
      if (!validator.isValid) {
        return validator;
      }
    }
    return {isValid: true};
  }
}

class DubboConfig extends BaseConfig {
  constructor(options = {}) {
    super();
    this.configCenter = new ConfigCenter(options.configCenter)
    this.registryCenter = new RegistryCenter(options.registryCenter)
    if (options.consumerAndService === undefined) {
      options.consumerAndService = {
        timeout: undefined,
        version: undefined,
        retries: undefined,
        cluster: undefined,
        group: undefined,
        connections: undefined,
        async: undefined,
        loadBalance: undefined
      }
    }
    this.consumerAndService = new ConsumerAndService(options.consumerAndService)
  }
}

export class RequestFactory {
  static TYPES = {
    HTTP: "HTTP",
    DUBBO: "DUBBO",
  }

  constructor(options = {}) {
    options.type = options.type || RequestFactory.TYPES.HTTP
    switch (options.type) {
      case RequestFactory.TYPES.DUBBO:
        return new DubboRequest(options);
      default:
        return new HttpRequest(options);
    }
  }
}

export class Request extends BaseConfig {
  constructor(type) {
    super();
    this.type = type;
  }

  showType() {
    return this.type;
  }

  showMethod() {
    return "";
  }
}

export class HttpRequest extends Request {
  constructor(options) {
    super(RequestFactory.TYPES.HTTP);
    this.name = undefined;
    this.url = undefined;
    this.path = undefined;
    this.method = undefined;
    this.parameters = [];
    this.headers = [];
    this.body = undefined;
    this.assertions = undefined;
    this.extract = undefined;
    this.environment = undefined;
    this.useEnvironment = undefined;

    this.set(options);
    this.sets({parameters: KeyValue, headers: KeyValue}, options);
  }

  initOptions(options) {
    options = options || {};
    options.method = options.method || "GET";
    options.body = new Body(options.body);
    options.assertions = new Assertions(options.assertions);
    options.extract = new Extract(options.extract);
    return options;
  }

  isValid(environmentId) {
    if (this.useEnvironment) {
      if (!environmentId) {
        return {
          isValid: false,
          info: 'api_test.request.please_configure_environment_in_scenario'
        }
      } else if (!this.path) {
        return {
          isValid: false,
          info: 'api_test.request.input_path'
        }
      }
    } else {
      if  (!this.url) {
        return {
          isValid: false,
          info: 'api_test.request.input_url'
        }
      }
      try {
        new URL(this.url)
      } catch (e) {
        return {
          isValid: false,
          info: 'api_test.request.url_invalid'
        }
      }
    }
    return {
      isValid: true
    }
  }

  showType() {
    return this.type;
  }

  showMethod() {
    return this.method.toUpperCase();
  }
}

export class DubboRequest extends Request {
  static PROTOCOLS = {
    DUBBO: "dubbo://",
    RMI: "rmi://",
  }

  constructor(options = {}) {
    super(RequestFactory.TYPES.DUBBO);
    this.name = options.name;
    this.protocol = options.protocol || DubboRequest.PROTOCOLS.DUBBO;
    this.interface = options.interface;
    this.method = options.method;
    this.configCenter = new ConfigCenter(options.configCenter);
    this.registryCenter = new RegistryCenter(options.registryCenter);
    this.consumerAndService = new ConsumerAndService(options.consumerAndService);
    this.args = [];
    this.attachmentArgs = [];
    this.assertions = new Assertions(options.assertions);
    this.extract = new Extract(options.extract);
    // Scenario.dubboConfig
    this.dubboConfig = undefined;

    this.sets({args: KeyValue, attachmentArgs: KeyValue}, options);
  }

  isValid() {
    if (!this.interface) {
      return {
        isValid: false,
        info: 'api_test.request.dubbo.input_interface'
      }
    }
    if (!this.method) {
      return {
        isValid: false,
        info: 'api_test.request.dubbo.input_method'
      }
    }
    if (!this.configCenter.isValid()) {
      return {
        isValid: false,
        info: 'api_test.request.dubbo.input_config_center'
      }
    }
    if (!this.registryCenter.isValid()) {
      return {
        isValid: false,
        info: 'api_test.request.dubbo.input_registry_center'
      }
    }
    if (!this.consumerAndService.isValid()) {
      return {
        isValid: false,
        info: 'api_test.request.dubbo.input_consumer_service'
      }
    }
    return {
      isValid: true
    }
  }

  showType() {
    return "RPC";
  }

  showMethod() {
    // dubbo:// -> DUBBO
    return this.protocol.substr(0, this.protocol.length - 3).toUpperCase();
  }

  clone() {
    return new DubboRequest(this);
  }
}

export class ConfigCenter extends BaseConfig {
  static PROTOCOLS = ["zookeeper", "nacos", "apollo"];

  constructor(options) {
    super();
    this.protocol = undefined;
    this.group = undefined;
    this.namespace = undefined;
    this.username = undefined;
    this.address = undefined;
    this.password = undefined;
    this.timeout = undefined;

    this.set(options);
  }

  isValid() {
    return !!this.protocol || !!this.group || !!this.namespace || !!this.username || !!this.address || !!this.password || !!this.timeout;
  }
}

export class RegistryCenter extends BaseConfig {
  static PROTOCOLS = ["none", "zookeeper", "nacos", "apollo", "multicast", "redis", "simple"];

  constructor(options) {
    super();
    this.protocol = undefined;
    this.group = undefined;
    this.username = undefined;
    this.address = undefined;
    this.password = undefined;
    this.timeout = undefined;

    this.set(options);
  }

  isValid() {
    return !!this.protocol || !!this.group || !!this.username || !!this.address || !!this.password || !!this.timeout;
  }
}

export class ConsumerAndService extends BaseConfig {
  static ASYNC_OPTIONS = ["sync", "async"];
  static LOAD_BALANCE_OPTIONS = ["random", "roundrobin", "leastactive", "consistenthash"];

  constructor(options) {
    super();
    this.timeout = "1000";
    this.version = "1.0";
    this.retries = "0";
    this.cluster = "failfast";
    this.group = undefined;
    this.connections = "100";
    this.async = "sync";
    this.loadBalance = "random";

    this.set(options);
  }

  isValid() {
    return !!this.timeout || !!this.version || !!this.retries || !!this.cluster || !!this.group || !!this.connections || !!this.async || !!this.loadBalance;
  }
}

export class Body extends BaseConfig {
  constructor(options) {
    super();
    this.type = undefined;
    this.raw = undefined;
    this.kvs = [];

    this.set(options);
    this.sets({kvs: KeyValue}, options);
  }

  isValid() {
    if (this.isKV()) {
      return this.kvs.some(kv => {
        return kv.isValid();
      })
    } else {
      return !!this.raw;
    }
  }

  isKV() {
    return this.type === BODY_TYPE.KV;
  }
}

export class KeyValue extends BaseConfig {
  constructor() {
    let options, key, value;
    if (arguments.length === 1) {
      options = arguments[0];
    }

    if (arguments.length === 2) {
      key = arguments[0];
      value = arguments[1];
    }

    super();
    this.name = key;
    this.value = value;

    this.set(options);
  }

  isValid() {
    return !!this.name || !!this.value;
  }
}

export class Assertions extends BaseConfig {
  constructor(options) {
    super();
    this.text = [];
    this.regex = [];
    this.duration = undefined;

    this.set(options);
    this.sets({text: Text, regex: Regex}, options);
  }

  initOptions(options) {
    options = options || {};
    options.duration = new Duration(options.duration);
    return options;
  }
}

export class AssertionType extends BaseConfig {
  constructor(type) {
    super();
    this.type = type;
  }
}

export class Text extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.TEXT);
    this.subject = undefined;
    this.condition = undefined;
    this.value = undefined;

    this.set(options);
  }
}

export class Regex extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.REGEX);
    this.subject = undefined;
    this.expression = undefined;
    this.description = undefined;

    this.set(options);
  }

  isValid() {
    return !!this.subject && !!this.expression;
  }
}

export class Duration extends AssertionType {
  constructor(options) {
    super(ASSERTION_TYPE.DURATION);
    this.value = undefined;

    this.set(options);
  }

  isValid() {
    return !!this.value;
  }
}

export class Extract extends BaseConfig {
  constructor(options) {
    super();
    this.regex = [];
    this.json = [];
    this.xpath = [];

    this.set(options);
    let types = {
      json: ExtractJSONPath,
      xpath: ExtractXPath,
      regex: ExtractRegex
    }
    this.sets(types, options);
  }
}

export class ExtractType extends BaseConfig {
  constructor(type) {
    super();
    this.type = type;
  }
}

export class ExtractCommon extends ExtractType {
  constructor(type, options) {
    super(type);
    this.variable = undefined;
    this.useHeaders = undefined;
    this.value = ""; // ${variable}
    this.expression = undefined;
    this.description = undefined;

    this.set(options);
  }

  isValid() {
    return !!this.variable && !!this.expression;
  }
}

export class ExtractRegex extends ExtractCommon {
  constructor(options) {
    super(EXTRACT_TYPE.REGEX, options);
  }
}

export class ExtractJSONPath extends ExtractCommon {
  constructor(options) {
    super(EXTRACT_TYPE.JSON_PATH, options);
  }
}

export class ExtractXPath extends ExtractCommon {
  constructor(options) {
    super(EXTRACT_TYPE.XPATH, options);
  }
}

/** ------------------------------------------------------------------------ **/
const JMX_ASSERTION_CONDITION = {
  MATCH: 1,
  CONTAINS: 1 << 1,
  NOT: 1 << 2,
  EQUALS: 1 << 3,
  SUBSTRING: 1 << 4,
  OR: 1 << 5
}

class JMXHttpRequest {
  constructor(request, environment) {
    if (request && request instanceof HttpRequest && (request.url || request.path)) {
      this.useEnvironment = request.useEnvironment;
      this.method = request.method;
      if (!request.useEnvironment) {
        if (!request.url.startsWith("http://") && !request.url.startsWith("https://")) {
          request.url = 'http://' + request.url;
        }
        let url = new URL(request.url);
        this.hostname = decodeURIComponent(url.hostname);
        this.port = url.port;
        this.protocol = url.protocol.split(":")[0];
        this.pathname = this.getPostQueryParameters(request, decodeURIComponent(url.pathname));
      } else {
        if (environment) {
          this.port = environment.port;
          this.protocol = environment.protocol;
          this.domain = environment.domain;
        }
        this.path = this.getPostQueryParameters(request, decodeURIComponent(request.path));
      }
    }
  }

  getPostQueryParameters(request, path) {
    if (this.method.toUpperCase() !== "GET") {
      path += '?';
      let parameters = [];
      request.parameters.forEach(parameter => {
        if (parameter.name && parameter.value) {
          parameters.push(parameter);
        }
      });
      for (let i = 0; i < parameters.length; i++) {
        let parameter = parameters[i];
        path += (encodeURIComponent(parameter.name) + '=' + encodeURIComponent(parameter.value));
        if (i != parameters.length -1) {
          path += '&';
        }
      }
    }
    return path;
  }
}

class JMXDubboRequest {
  constructor(request, dubboConfig) {
    // Request 复制
    let obj = request.clone();
    // 去掉无效的kv
    obj.args = obj.args.filter(arg => {
      return arg.isValid();
    });
    obj.attachmentArgs = obj.attachmentArgs.filter(arg => {
      return arg.isValid();
    });

    // Scenario DubboConfig复制
    this.copy(obj.configCenter, dubboConfig.configCenter);
    this.copy(obj.registryCenter, dubboConfig.registryCenter);
    this.copy(obj.consumerAndService, dubboConfig.consumerAndService);

    return obj;
  }

  copy(target, source) {
    for (let key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] !== undefined && !target[key]) {
          target[key] = source[key];
        }
      }
    }
  }
}

class JMeterTestPlan extends Element {
  constructor() {
    super('jmeterTestPlan', {
      version: "1.2", properties: "5.0", jmeter: "5.2.1"
    });

    this.add(new HashTree());
  }

  put(te) {
    if (te instanceof TestElement) {
      this.elements[0].add(te);
    }
  }
}

class JMXGenerator {
  constructor(test) {
    if (!test || !test.id || !(test instanceof Test)) return undefined;

    let testPlan = new TestPlan(test.name);
    this.addScenarios(testPlan, test.scenarioDefinition);

    this.jmeterTestPlan = new JMeterTestPlan();
    this.jmeterTestPlan.put(testPlan);
  }

  addScenarios(testPlan, scenarios) {
    scenarios.forEach(s => {
      let scenario = s.clone();

      let threadGroup = new ThreadGroup(scenario.name || "");

      this.addScenarioVariables(threadGroup, scenario);

      this.addScenarioHeaders(threadGroup, scenario);

      scenario.requests.forEach(request => {
        if (!request.isValid()) return;
        let sampler;

        if (request instanceof DubboRequest) {
          sampler = new DubboSample(request.name || "", new JMXDubboRequest(request, scenario.dubboConfig));
        }

        if (request instanceof HttpRequest) {
          sampler = new HTTPSamplerProxy(request.name || "", new JMXHttpRequest(request, scenario.environment));
          this.addRequestHeader(sampler, request);
          if (request.method.toUpperCase() === 'GET') {
            this.addRequestArguments(sampler, request);
          } else {
            this.addRequestBody(sampler, request);
          }
        }

        this.addRequestAssertion(sampler, request);

        this.addRequestExtractor(sampler, request);

        threadGroup.put(sampler);
      })

      testPlan.put(threadGroup);
    })
  }

  addEnvironments(environments, target) {
    let keys = new Set();
    target.forEach(item => {
      keys.add(item.name);
    });
    let envArray = environments;
    if (!(envArray instanceof Array)) {
      envArray = JSON.parse(environments);
      envArray.forEach(item => {
        if (item.name && !keys.has(item.name)) {
          target.push(new KeyValue(item.name, item.value));
        }
      })
    }
  }

  addScenarioVariables(threadGroup, scenario) {
    let environment = scenario.environment;
    if (environment) {
      this.addEnvironments(environment.variables, scenario.variables)
    }
    let args = this.filterKV(scenario.variables);
    if (args.length > 0) {
      let name = scenario.name + " Variables"
      threadGroup.put(new Arguments(name, args));
    }
  }

  addScenarioHeaders(threadGroup, scenario) {
    let environment = scenario.environment;
    if (environment) {
      this.addEnvironments(environment.headers, scenario.headers)
    }
    let headers = this.filterKV(scenario.headers);
    if (headers.length > 0) {
      let name = scenario.name + " Headers"
      threadGroup.put(new HeaderManager(name, headers));
    }
  }

  addRequestHeader(httpSamplerProxy, request) {
    let name = request.name + " Headers";
    this.addBodyFormat(request);
    let headers = this.filterKV(request.headers);
    if (headers.length > 0) {
      httpSamplerProxy.put(new HeaderManager(name, headers));
    }
  }

  addBodyFormat(request) {
    let bodyFormat = request.body.format;
    if (bodyFormat) {
      switch (bodyFormat) {
        case BODY_FORMAT.JSON:
          this.addContentType(request, 'application/json');
          break;
        case BODY_FORMAT.HTML:
          this.addContentType(request, 'text/html');
          break;
        case BODY_FORMAT.XML:
          this.addContentType(request, 'text/xml');
          break;
        default:
          break;
      }
    }
  }

  addContentType(request, type) {
    for (let index in request.headers) {
      if (request.headers[index].name == 'Content-Type') {
        request.headers.splice(index, 1);
        break;
      }
    }
    request.headers.push(new KeyValue('Content-Type', type));
  }

  addRequestArguments(httpSamplerProxy, request) {
    let args = this.filterKV(request.parameters);
    if (args.length > 0) {
      httpSamplerProxy.add(new HTTPSamplerArguments(args));
    }
  }

  addRequestBody(httpSamplerProxy, request) {
    let body = [];
    if (request.body.isKV()) {
      body = this.filterKV(request.body.kvs);
    } else {
      httpSamplerProxy.boolProp('HTTPSampler.postBodyRaw', true);
      body.push({name: '', value: request.body.raw, encode: false});
    }

    httpSamplerProxy.add(new HTTPSamplerArguments(body));
  }

  addRequestAssertion(httpSamplerProxy, request) {
    let assertions = request.assertions;
    if (assertions.regex.length > 0) {
      assertions.regex.filter(this.filter).forEach(regex => {
        httpSamplerProxy.put(this.getAssertion(regex));
      })
    }

    if (assertions.duration.isValid()) {
      let name = "Response In Time: " + assertions.duration.value
      httpSamplerProxy.put(new DurationAssertion(name, assertions.duration.value));
    }
  }

  getAssertion(regex) {
    let name = regex.description;
    let type = JMX_ASSERTION_CONDITION.CONTAINS; // 固定用Match，自己写正则
    let value = regex.expression;
    switch (regex.subject) {
      case ASSERTION_REGEX_SUBJECT.RESPONSE_CODE:
        return new ResponseCodeAssertion(name, type, value);
      case ASSERTION_REGEX_SUBJECT.RESPONSE_DATA:
        return new ResponseDataAssertion(name, type, value);
      case ASSERTION_REGEX_SUBJECT.RESPONSE_HEADERS:
        return new ResponseHeadersAssertion(name, type, value);
    }
  }

  addRequestExtractor(httpSamplerProxy, request) {
    let extract = request.extract;
    if (extract.regex.length > 0) {
      extract.regex.filter(this.filter).forEach(regex => {
        httpSamplerProxy.put(this.getExtractor(regex));
      })
    }

    if (extract.json.length > 0) {
      extract.json.filter(this.filter).forEach(json => {
        httpSamplerProxy.put(this.getExtractor(json));
      })
    }

    if (extract.xpath.length > 0) {
      extract.xpath.filter(this.filter).forEach(xpath => {
        httpSamplerProxy.put(this.getExtractor(xpath));
      })
    }
  }

  getExtractor(extractCommon) {
    let props = {
      name: extractCommon.variable,
      expression: extractCommon.expression,
    }
    let testName = props.name
    switch (extractCommon.type) {
      case EXTRACT_TYPE.REGEX:
        testName += " RegexExtractor";
        props.headers = extractCommon.useHeaders; // 对应jMeter body
        props.template = "$1$";
        return new RegexExtractor(testName, props);
      case EXTRACT_TYPE.JSON_PATH:
        testName += " JSONExtractor";
        return new JSONPostProcessor(testName, props);
      case EXTRACT_TYPE.XPATH:
        testName += " XPath2Evaluator";
        return new XPath2Extractor(testName, props);
    }
  }

  filter(config) {
    return config.isValid();
  }

  filterKV(kvs) {
    return kvs.filter(this.filter);
  }

  toXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += this.jmeterTestPlan.toXML();
    return xml;
  }
}


