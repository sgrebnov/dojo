define(["./_base/kernel", "./aspect", "./dom", "./dom-class", "./_base/lang", "./on", "./has", "./mouse", "./domReady", "./_base/window"],
function(dojo, aspect, dom, domClass, lang, on, has, mouse, domReady, win){

	// module:
	//		dojo/pointer

    var hasTouch = has("touch"),
        hasPointer = has("pointer"),
        lastTouch,
        mouseEventFireThreshold = 1000,

        POINTER_TYPE_TOUCH = "touch",
        POINTER_TYPE_PEN = "pen",
        POINTER_TYPE_MOUSE = "mouse",

        bindEvent = function(preferredEventName, mouseType, touchType, pointerType) {

            pointerType = browserSpecificEventName(pointerType);

            // Returns synthetic event that listens for pointer or both the specified mouse event and specified touch event.
            // But ignore fake mouse events that were generated due to the user touching the screen.
            if (hasPointer) {
                // Pointer events are designed to handle both mouse and touch in a uniform way,
                // so just use that regardless of hasTouch.             
                return function(node, listener) {
                    // TODO We may want to normalize Pointer events too since there could be a difference in comparison to the spec;
                    // for example in IE10 MSPointer.pointerType is int instead of string as per specification.
                    return on(node, pointerType, listener);
                }                
            }

            if (hasTouch) {
                return function(node, listener) {
                    var touchHandle = on(node, touchType, function(evt) {
                            var self = this;
                            lastTouch = (new Date()).getTime();

                            normalizeEvent(evt, POINTER_TYPE_TOUCH, preferredEventName).forEach(function(e){
                                listener.call(self, e);
                            })

                        }),
                        mouseHandle = on(node, mouseType, function(evt) {
                            if (!lastTouch || (new Date()).getTime() > lastTouch + mouseEventFireThreshold) {
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
            
            // no Pointer or Touch support
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
         * In case of Touch event returns separate Pointer event for each touch (event.changedTouches container).
         *
         * @param {Event} originalEvent TODO
         * @param {Enum} [eventType] TODO
         * @return {Array} A list of Pointer events.
         */
        normalizeEvent = function (originalEvent, eventType, preferredEventName) {
            // defines extra properties for normalized events (use default values)
            var pointerProperties = {"width" : 0, "height" : 0, "pressure" : 0, "tiltX" : 0, "tiltY" : 0, 
                "type" : preferredEventName, "pointerType" : eventType, "isPrimary" : true, "POINTER_TYPE_TOUCH" : POINTER_TYPE_TOUCH, 
                "POINTER_TYPE_PEN" : POINTER_TYPE_PEN, "POINTER_TYPE_MOUSE" : POINTER_TYPE_MOUSE},               
                normalizedEvents = [];

                if (eventType === POINTER_TYPE_MOUSE) {   

                    // Mouse is required to have a pointerId of 1   
                    pointerProperties.pointerId = 1;            
                    
                    normalizedEvents.push(PointerEvent(originalEvent, pointerProperties)); 

                } else if (eventType === POINTER_TYPE_TOUCH) {

                    for(var i=0; i<originalEvent.changedTouches.length; i++) {

                        var touch = originalEvent.changedTouches[i],
                            touchProperties = {"isPrimary": touch === originalEvent.touches[0], 
                            "pointerId" : touch.identifier + 2, // Touch identifiers can start at 0 so we add 2 to the touch identifier for compatibility.
                            "pageX" : touch.pageX, "pageY" : touch.pageY,
                            "clientX" : touch.clientX, "clientY" : touch.clientY,
                            "screenX" : touch.screenX, "screenY" : touch.screenY,
                            "currentTarget" : touch.target, "target" : touch.target};

                        var pointerPropertiesForTouch = lang.mixin(touchProperties, pointerProperties);
                       
                       normalizedEvents.push(PointerEvent(originalEvent, pointerPropertiesForTouch)); 
                    };                    
                }

                


            return normalizedEvents;
        },

        /**
         * Creates Pointer event from a given original event and properties table.     
         *
         * @param {Event} originalEvent TODO
         * @param {Object} [properties] Dictionary of initial event properties.
         * @return {Event} A new Pointer event initialized with properties from `properties`.
         */
        PointerEvent = function(originalEvent, properties) {
            var pointerEvent  = lang.delegate(properties, originalEvent);

            // override default event type
            pointerEvent.type = properties.type;
            
            var buttons = pointerEvent.buttons;
            if (buttons === undefined) {
                  switch (pointerEvent.which) {
                    case 1: buttons = 1; break;
                    case 2: buttons = 4; break;
                    case 3: buttons = 2; break;
                    default: buttons = 0;
                }

                Object.defineProperty(pointerEvent, 'buttons', {get: function(){ return buttons }, enumerable: true});
            }

            // use 0.5 for down state and 0 for up state.
            pointerEvent.pressure = pointerEvent.pressure || (pointerEvent.buttons ? 0.5 : 0);

            return pointerEvent;

        },

        browserSpecificEventName = function (eventName) {
            if(has("ie") == 10) {
                return "MS" + eventName;
            }

            return eventName;
        }


	//device touch model agnostic events - pointer.down|move|up|cancel|over|out|enter|leave
	var pointer = {
		down: bindEvent("pointer.down","mousedown", "touchstart", "PointerDown"),
		move: bindEvent("pointer.move", "mousemove", "touchmove", "PointerMove"),
		up: bindEvent("pointer.up", "mouseup", "touchend", "PointerUp"),
		cancel: bindEvent("pointer.cancel", mouse.leave, "touchcancel", "PointerCancel"),
		over: bindEvent("pointer.over", "mouseover", "touchover", "PointerOver"),
		out: bindEvent("pointer.out", "mouseout", "touchout", "PointerOut"),
		enter: bindEvent("pointer.enter", "mouseover","touchover", "PointerOver"),
		leave: bindEvent("pointer.leave", "mouseout", "touchout", "PointerOut")
	};

	has("extend-dojo") && (dojo.pointer = pointer);

	return pointer;


    // TODO
    // #0 create new pointer event from MouseEvent
    // #1 add dojoClick support and the rest dojo specific functionality
    // #2 review enter and leave events
    // comment/refactor

});
