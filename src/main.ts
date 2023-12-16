import Phaser from "phaser";
import MyScene from "./scenes/MyScene";
import {isPc} from "./util.ts";

const width = isPc ? 800: window.innerWidth;
const height  = isPc ? 600: window.innerHeight

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width,
    height,
    physics: {
        default: "matter",
        matter: {
            debug: true,
            gravity: { y: 0.2 },
            enableSleeping: true
        },
    },
    scene: MyScene,
    backgroundColor: "#FFF",
};
new Phaser.Game(config);