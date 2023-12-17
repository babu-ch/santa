import Phaser from "phaser";
import CollisionStartEvent = Phaser.Physics.Matter.Events.CollisionStartEvent;
import Image = Phaser.Physics.Matter.Image;
import {BodyType} from "matter";
import {last, random} from "lodash";
import {isPc} from "../util.ts";

const SANTA_MOVE_SPEED = 5
const DROP_PRESENT_PROBABILITY = 20
const DROP_TONAKAI_PROBABILITY = 5
const SANTA_SIZE = 100
const ITEM_SIZE = 100
// このmsの周期でさんたが落とすイベントを実行
const DROP_ITEM_DELAY = 200
const HISTORY_MAX_SIZE = 10
// プレゼント取ったときのスコア
const PRESENT_SCORE = 10
// トナカイ落としたときのスコア
const TONAKAI_SCORE = 10

export default class MyScene extends Phaser.Scene {
    // サンタさん
    private santa?: Image
    // サンタの動く方向とスピード
    private santaVelocityX: number = SANTA_MOVE_SPEED
    private isGameOver: boolean = false
    private score: number = 0
    // プレゼント落とすイベント
    private dropPresentEvent?: Phaser.Time.TimerEvent
    // プレゼント落とす確率
    private dropPresentProbability: number = DROP_PRESENT_PROBABILITY
    // トナカイ落とす確率
    private dropTonakaiProbability: number = DROP_TONAKAI_PROBABILITY
    // 直近の落としたか落としてないか
    private recentDropHistories: ("drop"|"nodrop")[] = []

    preload() {
        this.load.image("santa", "./santa.png")
        this.load.image("tonakai", "./tona.png")
        this.load.image("present", "./pre.png")
    }
    create() {
        this.matter.world.setBounds(0, 0, this.sys.canvas.width, this.sys.canvas.height)

        // init
        this.isGameOver = false
        this.score = 0
        this.dropPresentProbability = DROP_PRESENT_PROBABILITY
        this.dropTonakaiProbability = DROP_TONAKAI_PROBABILITY
        this.recentDropHistories = []
        this.santaVelocityX = SANTA_MOVE_SPEED

        // サンタ爆誕
        this.santa =
            this.matter.add.image( 50, 60, "santa")
                .setDisplaySize(SANTA_SIZE, SANTA_SIZE)
                .setStatic(true)

        // プレゼント落とすイベント開始
        this.dropPresentEvent = this.time.addEvent({
            delay: DROP_ITEM_DELAY,
            callback: this.dropPresent,
            callbackScope: this,
            loop: true
        });

        // 当たり判定
        this.setCollision()

        // 撮影用にスペースキー押すとpauseする
        // if (this.input.keyboard) {
        //     const spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
        //     spaceKey.on("down",  () => { this.scene.pause() })
        // }
    }

    update() {
        if (this.isGameOver) {
            return
        }
        //  サンタがどっちに動くか
        const santa = this.santa!
        const halfSanta = santa.displayWidth/2;
        if (santa.x >= (this.sys.canvas.width - (halfSanta))) {
            // 左に
            this.santaVelocityX = -SANTA_MOVE_SPEED
            santa.setFlipX(false)
        } else if(santa.x <= (halfSanta)) {
            // 右に
            this.santaVelocityX = SANTA_MOVE_SPEED
            santa.setFlipX(true)
        }
        santa.x += this.santaVelocityX
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
                    // プレゼント同士衝突してスマッシュされるのでぶつかったときは上にあげてあげる(やさしさ)
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
                    this.addScore(TONAKAI_SCORE)
                    return
                }
            })
        });
    }

    /**
     * 落とすかどうかを判定する
     */
    shouldDrop() {
        const isDrop =
            this.recentDropHistories.filter(history => history === "nodrop").length === HISTORY_MAX_SIZE
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
        const santa = this.santa!
        // たまにトナカイ落とす。
        if (lottery(this.dropTonakaiProbability)) {
            const tonakai = this.matter.add.image( santa.x, santa.y+santa.displayHeight, "tonakai")
                .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
                .setInteractive()
                .setVelocityX(random(-2, 2))
                .setVelocityY(random(0, 1))
            if (isInvertImage) {
                tonakai.setFlipX(true)
            }
            // トナカイは拾ったらゲームオーバー
            tonakai.on("pointerdown", () => {
                tonakai.destroy()
                this.gameOver()
            })
            return;
        }
        // プレゼント落とす。
        const present = this.matter.add.image(  santa.x, santa.y+santa.displayHeight,"present")
            .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
            .setInteractive()
            .setVelocityX(random(-2, 2))
            .setVelocityY(random(0, 1))
        if (isInvertImage) {
            present.setFlipX(true)
        }
        // プレゼントは拾ったらスコア加算
        present.on("pointerdown", () => {
            present.destroy()
            this.addScore(PRESENT_SCORE)
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
        this.recentDropHistories = this.recentDropHistories.slice(-HISTORY_MAX_SIZE)
    }
}

// bodiesのどれかがワールド境界か？
// 他に判断できる方法がわからなかったのでgameObjectがなければ壁ってことにしています
function isWall(...bodies:BodyType[]) {
    return !!bodies.find(body => !body?.gameObject)
}

// bodiesのどれかがプレゼントかトナカイか
function isDropItem(...bodies: BodyType[]) {
    return isPresent(...bodies) || isTonakai(...bodies)
}
// bodiesのどれかがプレゼントか
function isPresent(...bodies: BodyType[]) {
    return !!bodies.find(body => body?.gameObject?.texture?.key === "present")
}
// bodiesのどれかがトナカイか
function isTonakai(...bodies: BodyType[]) {
    return !!bodies.find(body => body?.gameObject?.texture?.key === "tonakai")
}
// bodiesのどれかが地面に当たったか
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

