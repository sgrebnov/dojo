define(["./_base/kernel", "./aspect", "./dom", "./dom-class", "./_base/lang", "./on", "./has", "./mouse", "./domReady", "./_base/window"],
function(dojo, aspect, dom, domClass, lang, on, has, mouse, domReady, win){

	// module:
	//		dojo/pointer

    var hasTouch = has("touch"),
        hasPointer = has("pointer"),
        lastTouch,
        EVENT_FIRE_TIME_THRESHOLD = 1000,

        POINTER_TYPE_TOUCH = "touch",
        POINTER_TYPE_PEN = "pen",
        POINTER_TYPE_MOUSE = "mouse",

        // test for DOM Level 4 Events
        NEW_MOUSE_EVENT = false,
       
       
        // Required for dojoClick specific functonality to generate synthetic clicks immediately 
        // rather than waiting for the browser to generate clicks after the double-tap delay.
        clickTracker = {
            CLICK_DEFAULT_THRESHOLD: 4,
            nonPreventedTags: ["AUDIO", "VIDEO", "TEXTAREA", "INPUT"],
            nonPreventedTypes: ["radio", "checkbox"]
        },

        /**
         * Depending on platform capabilites listens for specified pointer or touch or mouse event to trigger
         * its synthetic version which is Pointer Event spec compliant.
         * http://www.w3.org/TR/pointerevents/
         */
        bindEvent = function(preferredEventName, mouseType, touchType, pointerType) {         
                        
            // some platforms use special prefixes for pointer event names (like msPointerDown)
            pointerType = browserSpecificEventName(pointerType);

            
            if (hasPointer) { // browser supports Pointer Events so user them
                // Pointer events are designed to handle both mouse and touch in a uniform way,
                // so just use that regardless of hasTouch.             
                return function(node, listener) {
                    // TODO We may want to normalize Pointer events too since there could be a difference in comparison to the spec;
                    // for example in IE10 MSPointer.pointerType is int instead of string as per specification.
                    return on(node, pointerType, listener);
                }                
            }

            if (hasTouch) { // browser supports Touch Events so listen for touches
                return function(node, listener) {
                    var touchHandle = on(node, touchType, function(evt) {
                            var self = this;
                            lastTouch = (new Date()).getTime();

                            normalizeEvent(evt, POINTER_TYPE_TOUCH, preferredEventName).forEach(function(e){
                                listener.call(self, e);
                            })

                        }),
                        // TODO SG. Do we really need to listen for click events here? Any real use case or example? - discuss with Dojo team.
                        mouseHandle = on(node, mouseType, function(evt) {
                            if (!lastTouch || (new Date()).getTime() > lastTouch + EVENT_FIRE_TIME_THRESHOLD) {
                                listener.call(this, normalizeEvent(evt, POINTER_TYPE_MOUSE, preferredEventName)[0]);
                            }
                        });
                    return {
                        remove: function() {
                            touchHandle.remove();
                            mouseHandle.remove();
                        }
                    };
                };
            }
            
            // no Pointer and no Touch support
            // Avoid creating listeners for touch events on performance sensitive older browsers like IE6
            return function(node, listener) {
                    return on(node, mouseType, function(evt) {
                        listener.call(this, normalizeEvent(evt, POINTER_TYPE_MOUSE, preferredEventName)[0]);
                    });
                }
            
        },

        /**
         * Converts given Mouse or Touch event to a Pointer event.
         *
         * In case of Touch event returns individual Pointer event for each touch (event.changedTouches container).
         *
         * @param {Event} originalEvent Origianal Mouse or Touch event.
         * @param {Enum} [eventType] Event type: mouse/touch/other.
         * @param {String} [preferredEventName] Corresponding Pointer event name.
         * @return {Array} A list of synthetic Pointer events.
         */
        normalizeEvent = function (originalEvent, eventType, preferredEventName) {
            // defines extra properties for normalized events (use default values)
            var pointerProperties = {"width" : 0, "height" : 0, "pressure" : 0, "tiltX" : 0, "tiltY" : 0, 
                "type" : preferredEventName, "pointerType" : eventType, "POINTER_TYPE_TOUCH" : POINTER_TYPE_TOUCH, 
                "POINTER_TYPE_PEN" : POINTER_TYPE_PEN, "POINTER_TYPE_MOUSE" : POINTER_TYPE_MOUSE},               
                normalizedEvents = [];

                if (eventType === POINTER_TYPE_MOUSE) {// mouse event

                    // Mouse is required to have a pointerId of 1   
                    pointerProperties.pointerId = 1;            
                    pointerProperties.isPrimary = true;

                    normalizedEvents.push(PointerEvent(originalEvent, pointerProperties)); 

                } else if (eventType === POINTER_TYPE_TOUCH) { // touch event

                    var touch,
                        touchProperties,
                        pointerPropertiesForTouch,
                        initializeTouchProperties = function (evt, isPrimary) {
                            return {
                                "isPrimary": isPrimary,
                                "pointerId" : (evt.identifier || 0) + 102, // Touch identifiers can start at 0 so we add some value to the touch identifier for compatibility.
                                "pageX" : evt.pageX, "pageY" : evt.pageY,
                                "clientX" : evt.clientX || evt.pageX , "clientY" : evt.clientY || evt.pageY, // TODO - tmp, investigate and remove '|| evt.pageXY'
                                "screenX" : evt.screenX, "screenY" : evt.screenY,
                                "currentTarget" : evt.target, "target" : evt.target
                            }
                    };

                    if(!originalEvent.changedTouches) { // special case for dojo specific emulated events like dojotouchover
                        touchProperties = initializeTouchProperties(originalEvent, true),
                        pointerPropertiesForTouch = lang.mixin(touchProperties, pointerProperties);
                        normalizedEvents.push(PointerEvent(originalEvent, lang.mixin(touchProperties, pointerProperties)));
                        return normalizedEvents;
                    }

                    for(var i=0; i<originalEvent.changedTouches.length; i++) {
                        touch = originalEvent.changedTouches[i],
                        touchProperties = initializeTouchProperties(touch, touch === originalEvent.changedTouches[0]),
                        pointerPropertiesForTouch = lang.mixin(touchProperties, pointerProperties);
                       
                        normalizedEvents.push(PointerEvent(originalEvent, pointerPropertiesForTouch));
                    };                    
                }
            return normalizedEvents;
        },

        /**
         * Creates Pointer event from a given original event and additional Pointer speicific properties.     
         *
         * @param {Event} originalEvent Original Mouse or Touch event.
         * @param {Object} [properties] Dictionary of additional event properties.
         * @return {Event} A new Pointer event built from 'originalEvent' and with new properties from `properties`.
         */
        PointerEvent = function(originalEvent, properties) {
            
            var type = properties.type,
                p = lang.mixin(originalEvent, properties), // combine all properties so it is easy to use         
                pointerEvent;                
            
            if (NEW_MOUSE_EVENT) {
                pointerEvent = new MouseEvent(type, p);
            } else {
                pointerEvent = document.createEvent('MouseEvent');
               
                // define the properties inherited from MouseEvent
                pointerEvent.initMouseEvent(
                    type, p.bubbles || false, p.cancelable || false, p.view || null, p.detail || null,
                    p.screenX || 0, p.screenY || 0, p.clientX || 0, p.clientY || 0, p.ctrlKey || false,
                    p.altKey || false, p.shiftKey || false, p.metaKey || false, p.button || 0, p.relatedTarget || null
                );

            }

            // override properties
            Object.defineProperty(pointerEvent, 'srcElement', {get: function(){ return  p.srcElement}, enumerable: true});
            Object.defineProperty(pointerEvent, 'target', {get: function(){ return  p.target}, enumerable: true});
            Object.defineProperty(pointerEvent, 'pageX', {get: function(){ return  p.pageX}, enumerable: true});
            Object.defineProperty(pointerEvent, 'pageY', {get: function(){ return  p.pageY}, enumerable: true});

            // preventDefault functionality
            pointerEvent.preventDefault = function() {
                originalEvent.preventDefault();
            }
                        
            // TODO comment
            var buttons = originalEvent.buttons;
            if (buttons === undefined) {
                switch (originalEvent.which) {
                    case 1: buttons = 1; break;
                    case 2: buttons = 4; break;
                    case 3: buttons = 2; break;
                    default: buttons = 0;      
                }
            }  

            Object.defineProperty(pointerEvent, 'buttons', {get: function(){ return buttons }, enumerable: true});


            // use 0.5 for down state and 0 for up state.
            pointerEvent.pressure = pointerEvent.pressure || (pointerEvent.buttons ? 0.5 : 0);

            pointerEvent.originalEvent = originalEvent;



            // add the rest of the pointer properties
            return lang.mixin(pointerEvent, properties);

        },

        browserSpecificEventName = function (eventName) {
            // returns platform specific version of a given Pointer event name
            if(has("ie") == 10) {
                return "MS" + eventName;
            }

            return eventName;
        },

        findDojoClickProp = function (/*DOMNode*/ node) {
            // Tests if a node or its ancestor has been marked with the dojoClick property to indicate special processing,
            do {
                if (node.dojoClick) return node.dojoClick;
            } while (node = node.parentNode);
        },

        doClicks = function(e, moveType, endType) {
            // summary:
            //		Setup touch listeners to generate synthetic clicks immediately (rather than waiting for the browser
            //		to generate clicks after the double-tap delay) and consistently (regardless of whether event.preventDefault()
            //		was called in an event listener. Synthetic clicks are generated only if a node or one of its ancestors has
            //		its dojoClick property set to truthy.

            clickTracker.dojoClick  = !e.target.disabled && findDojoClickProp(e.target); // click threshold = true, number or x/y object

            if (clickTracker.dojoClick) {
                clickTracker.target = e.target;
                clickTracker.clickX = e.clientX;
                clickTracker.clickY = e.clientY;
                clickTracker.clickDx = (typeof clickTracker.dojoClick == "object" ?
                    clickTracker.dojoClick.x : (typeof clickTracker.dojoClick == "number" ? clickTracker.dojoClick : 0)) || clickTracker.CLICK_DEFAULT_THRESHOLD;
                clickTracker.clickDy = (typeof clickTracker.dojoClick == "object" ?
                    clickTracker.dojoClick.y : (typeof clickTracker.dojoClick == "number" ? clickTracker.dojoClick : 0)) || clickTracker.CLICK_DEFAULT_THRESHOLD;

                // add move/end handlers only the first time a node with dojoClick is seen,
                // so we don't add too much overhead when dojoClick is never set.
                if (!clickTracker.clicksInited) {
                    clickTracker.clicksInited = true;

                    win.doc.addEventListener(moveType, function(e) {
                        clickTracker = clickTracker && clickTracker.dojoClick &&
                            e.target == clickTracker.target &&
                            Math.abs((e.clientX) - clickTracker.clickX) <= clickTracker.clickDx &&
                            Math.abs((e.clientY) - clickTracker.clickY) <= clickTracker.clickDy;
                    }, true);

                    win.doc.addEventListener(endType, function(e) {
                        if (clickTracker.dojoClick) {
                            clickTracker.clickTime = (new Date()).getTime();
                            var target = e.target;

                            if (target.tagName === "LABEL") {
                                // when clicking on a label, forward click to its associated input if any
                                target = dom.byId(target.getAttribute("for")) || target;
                            }

                            setTimeout( function() {
                                on.emit(target, "click", {
                                    bubbles : true,
                                    cancelable : true,
                                    _dojo_click : true
                                });
                            });
                        }
                    }, true);

                    function stopNativeEvents(type) {
                        win.doc.addEventListener(type, function(e) {
                            // Stop native events when we emitted our own click event.  Note that the native click may occur
                            // on a different node than the synthetic click event was generated on.  For example,
                            // click on a menu item, causing the menu to disappear, and then (~300ms later) the browser
                            // sends a click event to the node that was *underneath* the menu.  So stop all native events
                            // sent shortly after ours, similar to what is done in dualEvent.
                            // The INPUT.dijitOffScreen test is for offscreen inputs used in dijit/form/Button, on which
                            // we call click() explicitly, we don't want to stop this event.
                            if(!e._dojo_click &&
                                (new Date()).getTime() <= clickTracker.clickTime + EVENT_FIRE_TIME_THRESHOLD &&
                                !(e.target.tagName == "INPUT" && domClass.contains(e.target, "dijitOffScreen"))) {
                                e.stopPropagation();
                                e.stopImmediatePropagation && e.stopImmediatePropagation();

                                if (type == "click" && clickTracker.nonPreventedTags.indexOf(e.target.tagName) == -1 && clickTracker.nonPreventedTypes.indexOf(e.target.type) == -1) {
                                    // preventDefault() breaks textual <input>s on android, keyboard doesn't popup,
                                    // but it is still needed for checkboxes and radio buttons, otherwise in some cases
                                    // the checked state becomes inconsistent with the widget's state
                                    e.preventDefault();
                                }
                            }
                        }, true);
                    }

                    stopNativeEvents("click");

                    // We also stop mousedown/up since these would be sent well after with our "fast" click (300ms),
                    // which can confuse some dijit widgets.
                    stopNativeEvents("mousedown");
                    stopNativeEvents("mouseup");
                }
            }
        };

    if (hasTouch) {
        // Pointer already has support for over and out, so we just need to init click support
        domReady( function() {
            if (hasPointer) {
                win.doc.addEventListener(browserSpecificEventName("PointerDown"), function(evt) {
                    doClicks(evt, browserSpecificEventName("PointerMove"), browserSpecificEventName("PointerUp"));
                }, true);

                return;
            }

            // Keep track of currently hovered node
            var hoveredNode = win.body(),	// currently hovered node
                ios4 = has("ios") < 5;

            win.doc.addEventListener("touchstart", function(evt) {
                // Precede touchstart event with touch.over event.  DnD depends on this.
                // Use addEventListener(cb, true) to run cb before any touchstart handlers on node run,
                // and to ensure this code runs even if the listener on the node does event.stop().
                var oldNode = hoveredNode;
                hoveredNode = evt.target;
                on.emit(oldNode, "dojotouchout", {
                    relatedTarget: hoveredNode,
                    bubbles: true
                });
                on.emit(hoveredNode, "dojotouchover", {
                    relatedTarget: oldNode,
                    bubbles: true
                });

                doClicks(evt, "touchmove", "touchend"); // init click generation
            }, true);

            function copyEventProps(evt) {
                // Make copy of event object and also set bubbles:true.  Used when calling on.emit().
                var props = lang.delegate(evt, {
                    bubbles: true
                });

                if(has("ios") >= 6){
                    // On iOS6 "touches" became a non-enumerable property, which
                    // is not hit by for...in.  Ditto for the other properties below.
                    props.touches = evt.touches;
                    props.altKey = evt.altKey;
                    props.changedTouches = evt.changedTouches;
                    props.ctrlKey = evt.ctrlKey;
                    props.metaKey = evt.metaKey;
                    props.shiftKey = evt.shiftKey;
                    props.targetTouches = evt.targetTouches;
                }

                return props;
            }

            function getElementFromEventPoint (e, ignorePageXOffset) {
                return win.doc.elementFromPoint(
                    e.pageX - (ignorePageXOffset ? 0 : win.global.pageXOffset), // iOS 4 expects page coords
                    e.pageY - (ignorePageXOffset ? 0 : win.global.pageYOffset)
                )
            }

            on(win.doc, "touchmove", function(evt) {
                var newNode = getElementFromEventPoint(evt, ios4);

                if (newNode) {
                    // Fire synthetic touchover and touchout events on nodes since the browser won't do it natively.
                    if (hoveredNode !== newNode) {
                        // touch out on the old node
                        on.emit(hoveredNode, "dojotouchout", {
                            relatedTarget: newNode,
                            bubbles: true
                        });

                        // touchover on the new node
                        on.emit(newNode, "dojotouchover", {
                            relatedTarget: hoveredNode,
                            bubbles: true
                        });

                        hoveredNode = newNode;
                    }

                    // Unlike a listener on "touchmove", on(node, "dojotouchmove", listener) fires when the finger
                    // drags over the specified node, regardless of which node the touch started on.
                    on.emit(newNode, "dojotouchmove", copyEventProps(evt));
                }
            });

            // Fire a dojotouchend event on the node where the finger was before it was removed from the screen.
            // This is different than the native touchend, which fires on the node where the drag started.
            on(win.doc, "touchend", function(evt) {
                var node = getElementFromEventPoint(evt, ios4) || win.body(); // if out of the screen
                on.emit(node, "dojotouchend", copyEventProps(evt));
            });

        });
    }

    // tests whether new MouseEvent is supported
    try {
        new MouseEvent('click', {buttons: 1});
        NEW_MOUSE_EVENT = true;
     } catch(e) {}


	//device touch model agnostic events - pointer.down|move|up|cancel|over|out|enter|leave
	var pointer = {
		down: bindEvent("pointer.down","mousedown", "touchstart", "PointerDown"),
		move: bindEvent("pointer.move", "mousemove", "touchmove", "PointerMove"),
		up: bindEvent("pointer.up", "mouseup", "dojotouchend", "PointerUp"),
		cancel: bindEvent("pointer.cancel", mouse.leave, "touchcancel", "PointerCancel"),
		over: bindEvent("pointer.over", "mouseover", "dojotouchover", "PointerOver"),
		out: bindEvent("pointer.out", "mouseout", "dojotouchout", "PointerOut"),
		enter: bindEvent("pointer.enter", "mouseover","dojotouchover", "PointerOver"),
		leave: bindEvent("pointer.leave", "mouseout", "dojotouchout", "PointerOut")
	};

	has("extend-dojo") && (dojo.pointer = pointer);

	return pointer;

});
