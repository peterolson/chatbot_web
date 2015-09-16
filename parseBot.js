var fs = require("fs");
var xml = require("node-xml-lite");

function separateChineseCharacters(text) {
    var cjkPattern = /[\u4E00-\u9FCC\u3400-\u4DB5\uFA0E\uFA0F\uFA11\uFA13\uFA14\uFA1F\uFA21\uFA23\uFA24\uFA27-\uFA29]|[\ud840-\ud868][\udc00-\udfff]|\ud869[\udc00-\uded6\udf00-\udfff]|[\ud86a-\ud86c][\udc00-\udfff]|\ud86d[\udc00-\udf34\udf40-\udfff]|\ud86e[\udc00-\udc1d]/;
    var out = "";
    for (var i = 0; i < text.length; i++) {
        var c = text[i];
        if (cjkPattern.test(c)) {
            out += " " + c + " ";
        } else {
            out += c;
        }
    }
    return out.replace(/  /g, " ").trim();
}
    
var parseBot = function (path) {
    var obj = {
        patternGraph: {},
        templates: [],
        maps: {},
        sets: {},
        properties: {},
        defaults: {},
        substitutions: {},
        vocabulary: 0,
        size: 0
    };
    
    function readCBML(data, name) {
        var lines = data.split("\n");
        var defaultThat = "*", defaultTopic = "*";
        var pattern = null, that = defaultThat, topic = defaultTopic, template = "";
        
        var line, rest = [];
        
        function startsWith(value) {
            rest[0] = line.slice(value.length).trim();
            return line.slice(0, value.length) === value;
        }
        
        function add() {
            if (pattern !== null) {
                var id = obj.templates.length;
                obj.templates.push(parseTemplate(template.trim()));
                addPattern(pattern + " <that> " + that + " <topic> " + topic, id);
            }
        }
        
        for (var i = 0; i < lines.length; i++) {
            line = lines[i].trim();
            if (startsWith(">")) {
                add();
                pattern = rest[0];
                that = defaultThat;
                topic = defaultTopic;
                template = "";
            }
            else if (startsWith("that>")) {
                that = rest[0];
            }
            else if (startsWith("topic>")) {
                topic = rest[0];
            } else {
                template += line;
            }
        }
        add();

        function parseTemplate(text) {
            return text;
        }
    }

    
    function readAIML(data, name) {
        var children = xml.parseString(data).childs;
        for (var i = 0; i < children.length; i++) {
            parseCategory(children[i]);
        }
    }
    
    var templatesDict = {};
    function storeTemplate(template) {
        if (template in templatesDict) return templatesDict[template];
        obj.templates.push(template);
        var index = obj.templates.length - 1;
        templatesDict[template] = index;
        return index;
    }
    
    function addPattern(pattern, id) {
        var path = separateChineseCharacters(pattern).split(" ");
        var words = [];
        for (var i = 0; i < path.length; i++) {
            var word = path[i];
            if (word.length) words.push(word);
        }
        obj.vocabulary += words.length;
        var node = obj.patternGraph;
        for (var i = 0; i < words.length; i++) {
            var word = words[i].toLowerCase()
            if (!node[word]) node[word] = {};
            node = node[word];
        }
        if (!(" " in node)) node[" "] = [];
        node[" "].push(id);
    }
    
    function parseCategory(node, dynamic) {
        if (node.name !== "category") return;
        obj.size++;
        var children = node.childs;
        var pattern = "", template = "", that = " <that> ", topic = " <topic> ";
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.name === "pattern") pattern += parsePattern(child);
            else if (child.name === "that") that += parsePattern(child);
            else if (child.name === "topic") topic += parsePattern(child);
            else if (child.name === "template") template = parseTemplate(child);
        }
        if (that === " <that> ") that += "*";
        if (topic === " <topic> ") topic += "*";
        pattern += that + topic;
        if (dynamic) {
            return pattern + "|" + template;
        } else {
            var index = storeTemplate(template);
            addPattern(pattern, index);
        }
    }
    
    function parsePattern(node) {
        var children = node.childs;
        var pattern = "";
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (typeof child === "string") pattern += child;
            else if (child.name === "set") pattern += setStatement(child);
            else if (child.name === "bot") pattern += botExpression(child);
            else if (child.name === "eval") pattern += evalExpression(child);
        }
        return pattern;
        
        function setStatement(node) {
            return "{{set:" + node.childs[0] + "}} ";
        }
        function botExpression(node) {
            var name;
            if (node.attrib) name = node.attrib.name;
            else name = node.childs[0].childs[0];
            return "{{property:" + name + "}} ";
        }

        function evalExpression(node) {
            return "{{eval:" + parseTemplate(node) + "}}";
        }
    }
    
    function getAttribute(node, name, _default) {
        var attribs = node.attrib, children = node.childs;
        if (attribs && name in attribs) {
            return attribs[name];
        }
        if (children && children.length) {
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                if (child.name === name) return parseTemplate(child);
            }
        }
        return _default;
    }
    
    function simpleWrap(name) {
        return function (node) {
            return "{{" + name + ":" + parseTemplate(node) + "}}";
        };
    }
    
    function conditionExpressionWrap(tagName) {
        return function (node) {
            var pattern = "{{" + tagName + ":";
            var children = node.childs, attribs = node.attrib;
            var name, value, body = "";
            if (attribs) {
                if (attribs.name) name = "name=" + attribs.name;
                if (attribs.var) name = "var=" + attribs.var;
                if (attribs.value) value = attribs.value;
            }
            if (children) {
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (child.name === "name") {
                        name = "name=" + parseTemplate(child);
                        node.childs.splice(i, 1);
                        i--;
                    }
                    else if (child.name === "var") {
                        name = "var=" + parseTemplate(child);
                        node.childs.splice(i, 1);
                        i--;
                    }
                    else if (child.name === "value") {
                        value = parseTemplate(child);
                        node.childs.splice(i, 1);
                        i--;
                    }
                }
                body = parseTemplate(node);
            }
            var interior = [];
            if (name) interior.push(name);
            if (value) interior.push(value);
            interior.push(body);
            return pattern + interior.join("|") + "}}";
        };
    }
    
    function parseTemplate(node) {
        var tags = {
            random: simpleWrap("random"),
            li: conditionExpressionWrap("li"),
            condition: conditionExpressionWrap("condition"),
            srai: simpleWrap("srai"),
            "set": function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs) {
                    var body = children && children.length ? "=" + parseTemplate(node) : "";
                    if (attribs.name) return "{{set:" + attribs.name + body + "}}";
                    if (attribs.var) return "{{setvar:" + attribs.var + body + "}}";
                }
                var firstChild = node.childs.shift();
                if (firstChild.name === "name") return "{{set:" + parseTemplate(firstChild) + "=" + parseTemplate(node) + "}}";
                if (firstChild.name === "var") return "{{setvar:" + parseTemplate(firstChild) + "=" + parseTemplate(node) + "}}";
            },
            "get": function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs) {
                    if (attribs.name) return "{{get:" + attribs.name + "}}";
                    if (attribs.var) return "{{getvar:" + attribs.var + "}}";
                }                    
                if (children) {
                    var child = children[0];
                    if (child.name === "name") return "{{get:" + parseTemplate(child) + "}}";
                    if (child.name === "var") return "{{getvar:" + parseTemplate(child) + "}}";
                }
            },
            map: function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs && attribs.name) return "{{map:" + attribs.name + "|" + parseTemplate(node) + "}}";
                var name = parseTemplate(children[0]);
                node.childs.shift();
                return "{{map:" + name + "|" + parseTemplate(node) + "}}";
            },
            bot: function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs && attribs.name) return "{{property:" + attribs.name + "}}";
                return "{{property:" + parseTemplate(children[0]) + "}}";
            },
            think: simpleWrap("think"),
            explode: simpleWrap("explode"),
            normalize: simpleWrap("normal"),
            denormalize: simpleWrap("denormal"),
            formal: simpleWrap("formal"),
            uppercase: simpleWrap("uppercase"),
            lowercase: simpleWrap("lowercase"),
            sentence: simpleWrap("sentence"),
            person: simpleWrap("person"),
            person2: simpleWrap("person2"),
            gender: simpleWrap("gender"),
            system: simpleWrap("system"),
            vocabulary: simpleWrap("vocabulary"),
            size: simpleWrap("size"),
            program: simpleWrap("program"),
            star: function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs && attribs.index !== undefined) return "$" + attribs.index;
                if (children && children.length) return "$" + parseTemplate(children[0]);
                return "$";
            },
            thatstar: function (node) {
                var index = getAttribute(node, "index", "");
                return "that$" + index;
            },
            topicstar: function (node) {
                var index = getAttribute(node, "index", "");
                return "topic$" + index;
            },
            that: function (node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs && attribs.index !== undefined) return "{{that:" + attribs.index + "}}";
                if (children && children.length) return "{{that:" + parseTemplate(children[0]) + "}}";
                return "{{that:}}";
            },
            input: function(node) {
                var children = node.childs, attribs = node.attrib;
                if (attribs && attribs.index !== undefined) return "{{input:" + attribs.index + "}}";
                if (children && children.length) return "{{input:" + parseTemplate(children[0]) + "}}";
                return "{{that:}}";
            },
            sr: function (node) {
                return "{{srai:$}}";
            },
            request: function (node) {
                var index = getAttribute(node, "index", "1");
                return "{{request:" + index + "}}";
            },
            response: function (node) {
                var index = getAttribute(node, "index", "1");
                return "{{response:" + index + "}}";
            },
            learn: function (node) {
                var children = node.childs;
                var template = "";
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (child.name === "category") {
                        template += "{{addCategory:" + parseCategory(child, true) + "}}";
                    }
                }
                return template;
            },
            date: function (node) {
                var jformat = getAttribute(node, "jformat", "MMMMMMMMM dd, yyyy");
                return "{{date:" + jformat + "}}";
            },
            interval: function (node) {
                var jformat = getAttribute(node, "jformat", "MMMMMMMMM dd, yyyy"),
                    style = getAttribute(node, "style", "years"),
                    from = getAttribute(node, "from", "January 1, 1970"),
                    to = getAttribute(node, "to", "{{date:" + jformat + "}}");
                return "{{interval:" + [jformat, style, from, to].join("|") + "}}";
            },
            eval: simpleWrap("eval"),
            loop: simpleWrap("loop"),
            hook: simpleWrap("hook")
        };
        
        function lowercasify(node) {
            if (node.attrib) {
                for (var key in node.attrib) {
                    node.attrib[key.toLowerCase()] = node.attrib[key];
                }
            }
            return node;
        }
        
        var children = node.childs;
        var template = "";
        if (!children) return template;
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (typeof child === "string") template += child;
            else if (tags[child.name]) template += tags[child.name](lowercasify(child)) || console.log(child);
        }
        return template;
    }
    
    function readProperties(data) {
        var arr = JSON.parse(data);
        for (var i = 0; i < arr.length; i++) {
            obj.properties[arr[i][0]] = arr[i][1];
        }
    }
    
    function readDefaults(data) {
        var arr = JSON.parse(data);
        for (var i = 0; i < arr.length; i++) {
            obj.defaults[arr[i][0]] = arr[i][1];
        }
    }
    
    function readSubstitutions(data, name) {
        var arr = JSON.parse(data);
        obj.substitutions[name] = obj.substitutions[name] || {};
        for (var i = 0; i < arr.length; i++) {
            obj.substitutions[name][arr[i][0]] = arr[i][1];
        }
    }
    
    function readMaps(data, name) {
        var arr = JSON.parse(data);
        obj.maps[name] = obj.maps[name] || {};
        for (var i = 0; i < arr.length; i++) {
            obj.maps[name][arr[i][0].toLowerCase()] = arr[i][1];
        }
    }
    
    function readSets(data, name) {
        var arr = JSON.parse(data);
        obj.sets[name] = obj.sets[name] || {};
        for (var i = 0; i < arr.length; i++) {
            obj.sets[name][arr[i].join(" ").toLowerCase()] = 1;
        };
    }
    
    var exts = {
        aiml: readAIML,
        cbml: readCBML,
        map: readMaps,
        set: readSets,
        substitution: readSubstitutions,
        properties: readProperties,
        defaults: readDefaults
    };
    
    function readFile(path, name, ext, done) {
        fs.readFile(path + "/" + name + "." + ext, function (err, data) {
            if (err) done(err);
            exts[ext](data.toString(), name);
            done();
        });
    };
    
    function readFiles(path, done) {
        fs.readdir(path, function (err, items) {
            if (err) done(err);
            
            var total = 0, count = 0;
            var callback = function (err) {
                if (err) done(err);
                count++;
                if (count == total) done();
            };
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i].split(".");
                var name = item[0], ext = item[1];
                if (!ext) {
                    total++;
                    readFiles(path + "/" + name, callback);
                } else if (ext in exts) {
                    total++;
                    readFile(path, name, ext, callback);
                }
            }
            if (total === 0) done();
        });
    }
    
    readFiles(path, function (err) {
        if (err) console.log(err);
        fs.writeFile("data.json", JSON.stringify(obj));
        fs.writeFile("data.js", "var bot = " + JSON.stringify(obj));
        console.log("done.");
    });
    
};

parseBot("bot");