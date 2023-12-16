import Phaser from "phaser";
import CollisionStartEvent = Phaser.Physics.Matter.Events.CollisionStartEvent;
import Image = Phaser.Physics.Matter.Image;
import {BodyType} from "matter";
import {last, random} from "lodash";
import {isPc} from "../util.ts";

const SANTA_MOVE_SPEED = isPc ? 5 : 3
const DROP_PRESENT_PROBABILITY = 20
const DROP_TONAKAI_PROBABILITY = 6
const SANTA_SIZE = 100
const ITEM_SIZE = 100
const DROP_ITEM_DELAY = 200

export default class MyScene extends Phaser.Scene {
    private santa?: Image
    private santaVelocityX: number = SANTA_MOVE_SPEED
    private isGameOver: boolean
    private score: number
    private dropPresentEvent?: Phaser.Time.TimerEvent
    private dropPresentProbability: number
    private dropTonakaiProbability: number
    private recentDropHistories: ("drop"|"nodrop")[] = []
    constructor() {
        super({key: "myscene"})
        this.isGameOver = false
        this.score = 0
        this.dropPresentProbability = DROP_PRESENT_PROBABILITY
        this.dropTonakaiProbability = DROP_TONAKAI_PROBABILITY
    }

    preload() {
        this.load.image("santa", "./santa.png")
        this.load.image("tonakai", "./tona.png")
        this.load.image("present", "./pre.png")
    }
    create() {
        this.matter.world.setBounds(0, 0, this.sys.canvas.width, this.sys.canvas.height)

        this.isGameOver = false
        this.score = 0
        this.dropPresentProbability = DROP_PRESENT_PROBABILITY
        this.dropTonakaiProbability = DROP_TONAKAI_PROBABILITY
        this.recentDropHistories = []

        // サンタ爆誕
        this.santa =
            this.matter.add.image( 50, 60, "santa")
                .setDisplaySize(SANTA_SIZE, SANTA_SIZE)
                .setStatic(true)
        this.santaVelocityX = SANTA_MOVE_SPEED

        //
        this.dropPresentEvent = this.time.addEvent({
            delay: DROP_ITEM_DELAY,
            callback: this.dropPresent,
            callbackScope: this,
            loop: true
        });

        this.setCollision()
    }

    update() {
        if (this.isGameOver) {
            return
        }
        const halfSanta = this.santa!.displayWidth/2;
        if (this.santa!.x >= (this.sys.canvas.width - (halfSanta))) {
            // 左に
            this.santaVelocityX = -SANTA_MOVE_SPEED
            this.santa!.setFlipX(false)
        } else if(this.santa!.x <= (halfSanta)) {
            // 右に
            this.santaVelocityX = SANTA_MOVE_SPEED
            this.santa!.setFlipX(true)
        }
        this.santa!.x += this.santaVelocityX
    }

    setCollision() {
        this.matter.world.on("collisionstart", (e:CollisionStartEvent) => {
            if (this.isGameOver) {
                return
            }
            e.pairs.forEach(pair => {
                const o1 = pair.bodyA
                const o2 = pair.bodyB
                const isWorldWall = isWall(o1, o2)
                // プレゼント同士の衝突
                if (isDropItem(o1) && isDropItem(o2)) {
                    o1.gameObject?.setVelocityX(-2)
                    o2.gameObject?.setVelocityX(2)
                    // プレゼント同士衝突してスマッシュされるのでぶつかったときは上にあげてあげる
                    o1.gameObject?.setVelocityY(-5)
                    o2.gameObject?.setVelocityY(-5)
                    return
                }
                // プレゼントと地面の当たり判定
                if (isPresent(o1, o2) && isWorldWall && isOnGround(this.sys.canvas.height, o1, o2)) {
                   isPresent(o1) ? o1.gameObject.destroy() : o2.gameObject.destroy();
                   this.gameOver();
                   return;
                }
                if (isTonakai(o1, o2) && isWorldWall && isOnGround(this.sys.canvas.height, o1, o2)) {
                    isTonakai(o1) ? o1.gameObject.destroy() : o2.gameObject.destroy()
                    this.addScore(10)
                    return
                }
            })
        });
    }

    shouldDrop() {
        const isDrop =
            this.recentDropHistories.filter(history => history === "nodrop").length === 10
        // 落とすかどうか 10回連続で落としてないなら強制で落とす
        if (!isDrop && !lottery(this.dropPresentProbability < 1 ? 1 : this.dropPresentProbability)) {
            this.pushDropHistory("nodrop")
            return false
        }
        // あと2回連続も落とさない
        if (last(this.recentDropHistories) === "drop") {
            this.pushDropHistory("nodrop")
            return false
        }
        this.pushDropHistory("drop")
        return true
    }

    dropPresent() {
        if (!this.shouldDrop()) {
            return
        }

        // 50%で画像を反転するか決める
        const isInvertImage = lottery(1);
        // たまにトナカイ落とす。
        if (lottery(this.dropTonakaiProbability)) {
            const tonakai = this.matter.add.image( this.santa!.x, this.santa!.y+this.santa!.displayHeight, "tonakai")
                .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
                .setInteractive()
                .setVelocityX(random(-2, 2))
                .setVelocityY(random(0, 1))
            if (isInvertImage) {
                tonakai.setFlipX(true)
            }
            tonakai.on("pointerdown", () => {
                tonakai.destroy()
                this.gameOver()
            })
            return;
        }
        // プレゼント落とす。
        const present = this.matter.add.image(  this.santa!.x, this.santa!.y+this.santa!.displayHeight,"present")
            .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
            .setInteractive()
            .setVelocityX(random(-2, 2))
            .setVelocityY(random(0, 1))
        if (isInvertImage) {
            present.setFlipX(true)
        }
        present.on("pointerdown", () => {
            present.destroy()
            this.addScore(10)
        })
    }

    addScore(point:number) {
        const beforeRange= Math.floor(this.score / 50)
        this.score += point
        const range = Math.floor(this.score / 50)
        // 50店きざみで難易度アップ
        if (range !== 0 && beforeRange !== range) {
            if (this.dropPresentProbability > 1) {
                this.dropPresentProbability--
                console.log("難易度up", this.dropPresentProbability)
            }
        }
    }

    gameOver() {
        this.isGameOver = true
        this.drawGameOverTexts()
        this.time.removeEvent(this.dropPresentEvent!)
    }

    // SPとPCで描画場所変える
    // 本当はPCでも割合計算すればマジックナンバー不要かも
    // y座標は対応さぼった
    drawGameOverTexts() {
        const x = isPc ? 400 : (window.innerWidth / 2)
        const scoreText = isPc ? `GAMEOVER score: ${this.score}` : `GAMEOVER\nscore: ${this.score}`
        this.add.text(x, 300, scoreText, {fontSize: 20, color: "black", backgroundColor:"#FFF"}).setOrigin(0.5)

        const buttonX = isPc ? 400 : (window.innerWidth / 2)
        const button = this.add.text(buttonX, 400, "RETRY", {fontSize: "32px", color:"black", backgroundColor:"#FFF"})
        button.setOrigin(0.5)
        button.on("pointerdown", () => {
            this.scene.restart()
        })
        button.setInteractive()
    }

    pushDropHistory(history:"drop"|"nodrop") {
        this.recentDropHistories.push(history)
        this.recentDropHistories = this.recentDropHistories.slice(-10)
    }
}

function isWall(...bodies:BodyType[]) {
    return !!bodies.find(body => !body?.gameObject)
}

function isDropItem(...bodies: BodyType[]) {
    return isPresent(...bodies) || isTonakai(...bodies)
}
function isPresent(...bodies: BodyType[]) {
    return !!bodies.find(body => body?.gameObject?.texture?.key === "present")
}
function isTonakai(...bodies: BodyType[]) {
    return !!bodies.find(body => body?.gameObject?.texture?.key === "tonakai")
}

function isOnGround(worldHeight:number, ...bodies: BodyType[]) {
    const item = bodies.find(body => body?.gameObject)
    if (!item) {
        return false
    }
    return (item.gameObject.y + item.gameObject.displayHeight) >= worldHeight
}

function lottery(n:number) {
    return random(n) === 0
}

