var getBot = (function () {
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

    var hardcodedSets = {
        number: function (text) {
            return /^[0-9]+$/.test(text);
        }
    };
    
    var hardcodedMaps = {
        successor: function (text) {
            return +text + 1;
        }
    }
    
    function findPattern(text, that, topic, bot) {
        text += " <that> " + that + " <topic> " + topic;
        var words = separateChineseCharacters(text).toLowerCase().split(" ");
        var wildcardMatches = [],
            thatWildcardMatches = [],
            topicWildcardMatches = [],
            matched = [];
        var patternIds = traverse(bot.patternGraph, words, wildcardMatches);
        return {
            patternIds: patternIds,
            wildcardMatches: wildcardMatches,
            thatWildcardMatches: thatWildcardMatches,
            topicWildcardMatches: topicWildcardMatches,
            matchedPattern: matched.join(" ")
        };
        
        function traverse(node, words, wildcardMatches) {
            var word = words[0];
            var dollarMatch = "$" + word,
                sharpMatch = "#",
                underscoreMatch = "_",
                wordMatch = word,
                setMatches = [],
                sets = [],
                caretMatch = "^",
                starMatch = "*";
            
            if (words.length === 0) {
                if (node[sharpMatch] && node[sharpMatch][" "]) {
                    wildcardMatches.push("");
                    matched.push(sharpMatch);
                    return node[sharpMatch][" "];
                }
                if (" " in node) return node[" "];
                if (node[caretMatch] && node[caretMatch][" "]) {
                    matched.push(caretMatch);
                    wildcardMatches.push("");
                    return node[caretMatch][" "];
                }
                return false;
            }
            for (var name in bot.sets) {
                setMatches.push("{{set:" + name.toLowerCase() + "}}");
                sets.push(bot.sets[name]);
            }
            for (var name in hardcodedSets) {
                setMatches.push("{{set:" + name.toLowerCase() + "}}");
                sets.push(hardcodedSets[name]);
            }
            if (word === "<that>") wildcardMatches = thatWildcardMatches;
            else if (word === "<topic>") wildcardMatches = topicWildcardMatches;
            var tail = words.slice(1);
            var result = simpleMatch(dollarMatch);
            if (result) return result;
            result = wildCard(sharpMatch, 0);
            if (result) return result;
            result = wildCard(underscoreMatch, 1);
            if (result) return result;
            result = simpleMatch(wordMatch);
            if (result) return result;
            for (var property in bot.properties) {
                var text = "{{property:" + property.toLowerCase() + "}}";
                var match = node[text];
                if (match && word === String(bot.properties[property]).toLowerCase()) {
                    var matchedLength = matched.length,
                        wildcardLength = wildcardMatches.length;
                    result = traverse(node, tail, wildcardMatches);
                    if (result) {
                        wildcardMatches.splice(wildcardLength, 0, word);
                        matched.splice(matchedLength, 0, text);
                        return result;
                    } else {
                        matched.length = matchedLength;
                        wildcardMatches.length = wildcardLength;
                    }
                }
            }
            for (var i = 0; i < setMatches.length; i++) {
                var match = setMatches[i],
                    isMatch = typeof sets[i] === "function" ? sets[i](word) : sets[i][word];
                if (node[match] && isMatch) {
                    var matchedLength = matched.length,
                        wildcardLength = wildcardMatches.length;
                    result = traverse(node[match], tail, wildcardMatches);
                    if (result) {
                        wildcardMatches.splice(wildcardLength, 0, word);
                        matched.splice(matchedLength, 0, match);
                        return result;
                    } else {
                        matched.length = matchedLength;
                        wildcardMatches.length = wildcardLength;
                    }
                }
            }
            result = wildCard(caretMatch, 0);
            if (result) return result;
            result = wildCard(starMatch, 1);
            if (result) return result;
            
            
            function wildCard(text, start) {
                var match = node[text];
                if (!match) return;
                var result;
                var wildcardLength = wildcardMatches.length,
                    matchedLength = matched.length;
                for (var i = start; i <= words.length; i++) {
                    var left = words.slice(i);
                    result = traverse(match, left, wildcardMatches);
                    if (result) {
                        matched.splice(matchedLength, 0, text);
                        wildcardMatches.splice(wildcardLength, 0, words.slice(0, i).join(" "));
                        return result;
                    }
                    else {
                        wildcardMatches.length = wildcardLength;
                        matched.length = matchedLength;
                    }
                }
            }
            
            function simpleMatch(text) {
                var match = node[text];
                if (!match) return;
                var matchedLength = matched.length;
                var result = traverse(match, tail, wildcardMatches);
                if (result) {
                    matched.splice(matchedLength, 0, text);
                    return result;
                } else {
                    matched.length = matchedLength;
                }
            }
        }
    }
    
    function addPattern(bot, pattern, id) {
        var path = separateChineseCharacters(pattern).split(" ");
        var words = [];
        for (var i = 0; i < path.length; i++) {
            var word = path[i];
            if (word.length) words.push(word);
        }
        bot.vocabulary += words.length;
        var node = bot.patternGraph;
        for (var i = 0; i < words.length; i++) {
            var word = words[i].toLowerCase()
            if (!node[word]) node[word] = {};
            node = node[word];
        }
        if (!(" " in node)) node[" "] = [];
        node[" "].push(id);
    }
    
    var globals = {},
        categoryScopes = [];
    
    function split(str, splitter) {
        var items = [],
            word = "";
        var balance = 0;
        for (var i = 0; i < str.length; i++) {
            if (str[i] === "{" && str[i + 1] === "{") {
                word += "{{";
                i++;
                balance++;
            }
            else if (str[i] === "}" && str[i + 1] === "}") {
                word += "}}";
                i++;
                balance--;
                if (!splitter.length && balance === 0) {
                    items.push(word);
                    word = "";
                }
            }
            else if (balance === 0 && str.slice(i, i + splitter.length) === splitter) {
                if (!splitter.length) {
                    if (word.length) {
                        items.push(word);
                    }
                    items.push(str[i]);
                    word = "";
                    continue;
                }
                items.push(word);
                i += splitter.length - 1;
                word = "";
            }
            else {
                word += str[i];
            }
        }
        items.push(word);
        return items;
    }
    
    function parseTemplate(text, that, topic, bot, result) {
        
        function parse(text) {
            return parseTemplate(text, that, topic, bot, result);
        }
        var _undefined = String(bot.properties["default-get"]);
        function makeSubstitution(subs) {
            return function (text) {
                text = text || "$";
                text = " " + parse(text).toLowerCase() + " ";
                var subsLowercase = {};
                var maxLength = 0;
                for (var i in subs) {
                    if (i.length > maxLength) maxLength = i.length;
                    subsLowercase[i.toLowerCase()] = subs[i];
                }
                var replacement = "";
                outer: 
                    for (var i = 0; i < text.length; i++) {
                        for (var j = maxLength; j > 0; j--) {
                            var slice = text.slice(i, i + j);
                            var substitution = null;
                            if (slice in subsLowercase) substitution = subsLowercase[slice];
                            if (text[i - 1] === " " && " " + slice in subsLowercase)
                                substitution = subsLowercase[" " + slice];
                            if (substitution !== null) {
                                replacement += substitution;
                                i += j - 1;
                                continue outer;
                            }
                        }
                        replacement += text[i];
                    }
                return replacement.trim();
            };
        }
        
        function getHistoryItem(array) {
            return function (text) {
                var n = array.length - parse(text);
                if (array[n]) return array[n];
                return array[array.length - 1];
            };
        }
        
        function expandEvals(text) {
            var out = "";
            for (var i = 0; i < text.length; i++) {
                if (text.slice(i, i + 6) === "{{eval") {
                    var part = split(text.slice(i), "");
                    out += parse(part[0].slice(7, -2));
                    i += part[0].length - 1;
                } else {
                    out += text[i];
                }
            }
            return out;
        }
        
        var tags = {
            random: function (text) {
                text = split(text, "");
                var items = [];
                for (var i = 0; i < text.length; i++) {
                    if (text[i].length > 1) items.push(text[i]);
                }
                var item = items[Math.floor(Math.random() * items.length)];
                if (!item) return "";
                return parse(item.slice(5, -2));
            },
            srai: function (text) {
                text = parse(text);
                console.log("srai", text);
                var response = getResponse(text, that, topic, bot);
                return response + " ";
            },
            "set": function (text) {
                var parts = split(text, "=");
                var name = parse(parts[0]),
                    value = parse(parts[1]).trim();
                globals[name] = value;
                if (name === "topic") {
                    currentTopic = value;
                }
                return value;
            },
            setvar: function (text) {
                var parts = split(text, "=");
                var name = parse(parts[0]),
                    value = parse(parts[1]).trim();
                categoryScopes[result.id] = categoryScopes[result.id] || {};
                categoryScopes[result.id][name] = value;
                return value;
            },
            "get": function (text) {
                var name = parse(text);
                return name in globals ? globals[name] : _undefined;
            },
            getvar: function (text) {
                var name = parse(text);
                categoryScopes[result.id] = categoryScopes[result.id] || {};
                return name in categoryScopes[result.id] ? categoryScopes[result.id][name] : _undefined;
            },
            think: function (text) {
                parse(text);
                return "";
            }, 
            condition: function (text) {
                var conditionParts = split(text, "|");
                var arity = conditionParts.length,
                    first = conditionParts[0], second = conditionParts[1], third = conditionParts[2];
                var out = "", loopCount = 0;
                var MAX_LOOPS = 102;
                while (loopCount++ < MAX_LOOPS) {
                    if (arity === 3) {
                        if (equals(getVar(first), parse(second))) out += parse(third);
                    }
                    else if (arity === 2) {
                        var value = getVar(first);
                        var parts = split(second, "");
                        for (var i = 0; i < parts.length; i++) {
                            var part = parts[i];
                            if (part.length < 2) continue;
                            var inside = split(part.slice(5, -2), "|");
                            if (inside.length === 1) {
                                out += parse(inside[0]);
                                break;
                            }
                            if (equals(value, parse(inside[0]))) {
                                out += parse(inside[1]);
                                break;
                            }
                        }
                    }
                    else {
                        var parts = split(first, "");
                        for (var i = 0; i < parts.length; i++) {
                            var part = parts[i];
                            if (part.length < 2) continue;
                            var inside = split(part.slice(5, -2), "|");
                            if (inside.length === 1) {
                                out += parse(inside[0]);
                                break;
                            }
                            if (inside.length === 3) {
                                if (equals(getVar(inside[0]), parse(inside[1]))) {
                                    out += parse(inside[2]);
                                    break;
                                }
                            }
                        }
                    }
                    var loopIndex = out.indexOf("@@@@");
                    if (loopIndex >= 0) {
                        out = out.slice(0, loopIndex);
                        continue;
                    }
                    break;
                }
                if (loopCount >= MAX_LOOPS) {
                    out = "Too many loops.";
                }
                return out;
                
                function getVar(text) {
                    var parts = text.split("=");
                    if (parts[0] === "var") return tags.getvar(parts[1]);
                    return tags.get(parts[1]);
                }
                
                function equals(a, b) {
                    return (a !== _undefined && b === "*") || a.toUpperCase() === b.toUpperCase();
                }
            },
            li: function (text) {
                return "{{li:" + text + "}}";
            },
            loop: function () {
                return "@@@@";
            },
            map: function (text) {
                var parts = split(text, "|");
                var map = parse(parts[0]),
                    name = parse(parts[1]).toLowerCase();
                if (map in hardcodedMaps) {
                    return hardcodedMaps[map](name);
                }
                return map in bot.maps ? bot.maps[map][name] : _undefined;
            },
            property: function (text) {
                var name = parse(text);
                return name in bot.properties ? bot.properties[name] : _undefined;
            },
            formal: function (text) {
                // i18n uppercasing function from http://stackoverflow.com/a/5122461/546661
                return parse(text).toLowerCase().replace(/^[\u00C0-\u1FFF\u2C00-\uD7FF\w]|\s[\u00C0-\u1FFF\u2C00-\uD7FF\w]/g, function (letter) {
                    return letter.toUpperCase();
                });
            },
            lowercase: function (text) {
                return parse(text).toLowerCase();
            },
            uppercase: function (text) {
                return parse(text).toUpperCase();
            },
            sentence: function (text) {
                text = parse(text);
                return text[0].toUpperCase() + text.slice(1);
            },
            denormal: makeSubstitution(bot.substitutions.denormal),
            normal: makeSubstitution(bot.substitutions.normal),
            gender: makeSubstitution(bot.substitutions.gender),
            person: makeSubstitution(bot.substitutions.person),
            person2: makeSubstitution(bot.substitutions.person2),
            explode: function (text) {
                return parse(text).split("").join(" ");
            },
            system: function () {
                // TODO
                return "Sorry, system calls are not supported";
            },
            vocabulary: function () {
                return String(bot.vocabulary);
            },
            size: function () {
                return String(bot.size);
            },
            program: function () {
                return "JavaScript chatbot interpreter";
            },
            that: function (text) {
                if (text.length) {
                    text = parse(text);
                    var index = text.split(",");
                    if (index.length === 2) {
                        var m = thatHistory.length - index[0];
                        if (thatHistory[m]) {
                            var n = thatHistory[m].length - index[1];
                            if (thatHistory[m][n]) return thatHistory[m][n];
                        }
                    }
                }
                return currentThat;
            },
            input: getHistoryItem(inputHistory),
            request: getHistoryItem(requestHistory),
            response: getHistoryItem(responseHistory),
            addCategory: function (text) {
                bot.size++;
                var parts = split(text, "|");
                var pattern = expandEvals(parts[0]), template = expandEvals(parts[1]);
                if (pattern.indexOf("<that>") < 0) pattern += " <that> *";
                if (pattern.indexOf("<topic>") < 0) pattern += " <topic> *";
                var id = bot.templates.length;
                bot.templates.push(template);
                addPattern(bot, pattern, id);
                return "";
            },
            eval: function (text) {
                return parse(text);
            },
            hook: function (text) {
                var parts = split(text, "|").map(parse);
                var name = parts[0], args = parts.slice(1);
                if (typeof bot.hooks[name] === "function") {
                    return bot.hooks[name](args);
                }
                return "Missing hook '" + name + "'.";
            }
        };
        
        var out = "", i;
        for (i = 0; i < text.length; i++) {
            var c = text[i];
            if (c === "{" && text[i + 1] === "{") {
                out += getInside();
                continue;
            }
            if (parseStar("$", result.wildcardMatches)) continue;
            if (parseStar("that$", result.thatWildcardMatches)) continue;
            if (parseStar("topic$", result.topicWildcardMatches)) continue;
            out += c;
        }
        
        return out;
        
        function parseStar(start, matches) {
            if (text.slice(i, i + start.length) === start) {
                i += start.length;
                if (text[i] === "$") {
                    out += start + "$";
                    return true;
                }
                var index = "";
                while (/[0-9]/.test(text[i])) {
                    index += text[i];
                    i++;
                }
                if (index === "") out += matches[0];
                else out += matches[+index - 1] || "";
                i--;
                return true;
            }
        }
        
        function getInside() {
            var balance = 1, start = i + 2;
            for (i = start; i < text.length; i++) {
                if (text.slice(i, i + 2) === "{{") balance++;
                if (text.slice(i, i + 2) === "}}") {
                    balance--;
                    if (balance === 0) break;
                    i++;
                }
            }
            var split = text.slice(start, i).split(":"),
                tag = split[0],
                inside = split.slice(1).join(":");
            i++;
            if (tags[tag]) return tags[tag](inside);
            console.log("unknown tag", tag);
            return inside;
        }
    }
    
    var thatHistory = [],
        inputHistory = [],
        requestHistory = [],
        responseHistory = [],
        currentThat = "undefined",
        currentTopic = "undefined";
    
    function getMultiSentenceResponse(text, that, topic, bot) {
        requestHistory.push(text);
        text = normalize(text, bot);
        var sentences = text.split(new RegExp("[\\" + (bot.properties["sentence-splitters"] || ".!?。？！").split("").join("\\") + "]"));
        var response = "";
        var newThat = [];
        for (var i = 0; i < sentences.length; i++) {
            var sentence = sentences[i];
            if (sentence.trim().length < 1) continue;
            inputHistory.push(sentence);
            console.log("that = ", currentThat, "; topic = ", currentTopic);
            currentThat = getResponse(sentences[i], that.slice(0, 50), topic, bot);
            newThat.push(currentThat);
            response += currentThat + " ";
        }
        thatHistory.push(newThat);
        console.log("Globals: ", globals);
        response = response.replace(/( )+/g, " ");
        responseHistory.push(response);
        return response;
    }
    
    function normalize(text, bot) {
        text = " " + text.toLowerCase() + " ";
        var subs = bot.substitutions.normal;
        for (var i in subs) {
            text = text.split(i).join(subs[i]);
        }
        return text.slice(1, -1);
    }
    
    function getResponse(text, that, topic, bot) {
        var result = findPattern(text, that, topic, bot);
        var response;
        if (result.patternIds.length === 0) return "I don't know what to say. :(";
        var id = result.patternIds[Math.floor(Math.random() * result.patternIds.length)];
        result.id = id;
        console.log("Matched: ", result.matchedPattern);
        console.log("Wildcard matches: ", result.wildcardMatches.join(", "));
        return parseTemplate(bot.templates[id], that, topic, bot, result);
    }
    if (typeof require !== "undefined") {
        var fs = require("fs");
        fs.readFile("data.json", function (err, data) {
            if (err) return console.log(err);
            var bot = JSON.parse(data);
            (function loop() {
                ask(function (input) {
                    console.log(getMultiSentenceResponse(input, currentThat, currentTopic, bot));
                    loop();
                });
            })();
        });
        
        function ask(callback) {
            var stdin = process.stdin, stdout = process.stdout;
            stdout.write("> ");
            stdin.resume();
            
            stdin.once('data', function (data) {
                data = data.toString().trim();
                callback(data);
            });
        }
    }
    return function (bot) {
        bot.hooks = {};
        globals = bot.defaults || {};
        return {
            replyTo: function (input) {
                return getMultiSentenceResponse(input, currentThat, currentTopic, bot);
            },
            hooks: bot.hooks
        };
    }
})();