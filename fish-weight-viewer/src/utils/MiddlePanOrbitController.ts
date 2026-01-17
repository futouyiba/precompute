import { OrbitController } from '@deck.gl/core';

export default class MiddlePanOrbitController extends OrbitController {
    constructor(props: any) {
        super(props);
    }

    handleEvent(event: any) {
        // Mjolnir.js event
        // event.type: 'panstart', 'panmove', 'panend'
        // event.srcEvent: MouseEvent / PointerEvent

        // MouseEvent.buttons: 1=Left, 2=Right, 4=Middle
        // But for 'pan' event, we might need to check which button initiated it.
        // deck.gl controller usually checks `event.leftButton`, `event.rightButton`, `event.middleButton` if parsed by mjolnir

        // Actually, let's look at the raw event.
        if (event.type === 'panstart' || event.type === 'panmove' || event.type === 'panend') {
            const { srcEvent } = event;
            // buttons bitmask: 4 is middle mouse button
            if (srcEvent.buttons === 4) {
                // Force this to be treated as a PAN interaction
                // The base Controller.handleEvent uses this.dragMode to decide.

                // We can temporarily force the internal state or just call the pan handler?
                // But deck.gl state machine is complex.

                // A cleaner way often used: map aliases.
                // But simpler hacking: modify the event to look like a Right Click (buttons=2) if it is Middle Click?
                // No, that might be messy.

                // Better approach: Override the input mapping logic if possible.
                // Or just:
                // If it's middle button, we want to invoke the pan logic.
                // Default OrbitController.handleEvent checks:
                // if (event.rightButton) -> pan
                // if (event.leftButton) -> rotate

                // So if we mock 'rightButton' property on the event object?
                // mjolnir adds these properties.

                // Let's try to alias middle button to right button semantics for panning.
                if (event.middleButton) {
                    event.rightButton = true;
                    event.leftButton = false;
                    // Override type if needed? OrbitController usually looks at buttons.
                }
            }
        }

        return super.handleEvent(event);
    }
}
