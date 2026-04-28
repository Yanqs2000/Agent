const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');

const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [{x: 10, y: 10}];
let food = {};
let dx = 0;
let dy = 0;
let score = 0;
let gameRunning = false;
let gamePaused = false;
let gameLoop;

function randomFoodPosition() {
    food = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount)
    };
    // 确保食物不在蛇身上
    for (let segment of snake) {
        if (segment.x === food.x && segment.y === food.y) {
            randomFoodPosition();
            break;
        }
    }
}

function drawGame() {
    // 清空画布
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制蛇
    ctx.fillStyle = '#4CAF50';
    for (let segment of snake) {
        ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    }

    // 绘制食物
    ctx.fillStyle = '#FF5722';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 2, gridSize - 2);
}

function moveSnake() {
    if (dx === 0 && dy === 0) return;

    const head = {x: snake[0].x + dx, y: snake[0].y + dy};

    // 检查碰撞
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        gameOver();
        return;
    }

    for (let segment of snake) {
        if (head.x === segment.x && head.y === segment.y) {
            gameOver();
            return;
        }
    }

    snake.unshift(head);

    // 检查是否吃到食物
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreElement.textContent = score;
        randomFoodPosition();
    } else {
        snake.pop();
    }
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameLoop);
    alert(`游戏结束！最终得分: ${score}`);
}

function startGame() {
    if (gameRunning) return;
    
    snake = [{x: 10, y: 10}];
    dx = 0;
    dy = 0;
    score = 0;
    scoreElement.textContent = score;
    gameRunning = true;
    gamePaused = false;
    
    randomFoodPosition();
    
    gameLoop = setInterval(() => {
        if (!gamePaused) {
            moveSnake();
            drawGame();
        }
    }, 100);
}

function togglePause() {
    if (!gameRunning) return;
    gamePaused = !gamePaused;
    pauseBtn.textContent = gamePaused ? '继续' : '暂停';
}

// 键盘控制
document.addEventListener('keydown', (e) => {
    if (!gameRunning || gamePaused) return;
    
    switch(e.key) {
        case 'ArrowUp':
            if (dy !== 1) {
                dx = 0;
                dy = -1;
            }
            break;
        case 'ArrowDown':
            if (dy !== -1) {
                dx = 0;
                dy = 1;
            }
            break;
        case 'ArrowLeft':
            if (dx !== 1) {
                dx = -1;
                dy = 0;
            }
            break;
        case 'ArrowRight':
            if (dx !== -1) {
                dx = 1;
                dy = 0;
            }
            break;
    }
});

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);

// 初始化游戏画面
drawGame();
randomFoodPosition();