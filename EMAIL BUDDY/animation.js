import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class FuturisticEmailHub {
    constructor() {
        // Core setup
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            alpha: true, 
            antialias: true,
            powerPreference: "high-performance"
        });
        
        // Interaction states
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.interactiveObjects = new Map(); // Store interactive objects and their handlers
        
        // Animation states
        this.clock = new THREE.Clock();
        this.mixers = []; // Animation mixers
        this.activeAnimations = new Map();
        
        // Initialize components
        this.init();
        this.setupLights();
        this.setupEnvironment();
        this.loadModels();
        this.setupPostProcessing();
        this.addInteractivity();
        this.animate();
    }

    async init() {
        // Enhanced renderer setup
        this.renderer.setSize(window.innerWidth, 500);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        
        // Add to header
        const header = document.querySelector('header');
        this.renderer.domElement.style.position = 'absolute';
        this.renderer.domElement.style.top = '0';
        this.renderer.domElement.style.left = '0';
        this.renderer.domElement.style.zIndex = '0';
        header.style.height = '500px';
        header.appendChild(this.renderer.domElement);

        // Camera setup
        this.camera.position.set(0, 2, 8);
        this.camera.lookAt(0, 0, 0);

        // Setup DRACO loader for compressed models
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.setDRACOLoader(dracoLoader);

        // Environment setup
        const envMapLoader = new THREE.CubeTextureLoader();
        const envMap = await this.loadEnvironmentMap(envMapLoader);
        this.scene.environment = envMap;
        this.scene.background = new THREE.Color(0x0c1445);
        this.scene.fog = new THREE.FogExp2(0x0c1445, 0.05);

        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    async loadEnvironmentMap(loader) {
        return new Promise((resolve) => {
            loader.load([
                'px.jpg', 'nx.jpg',
                'py.jpg', 'ny.jpg',
                'pz.jpg', 'nz.jpg'
            ], resolve);
        });
    }

    setupLights() {
        // Main lighting setup
        const ambientLight = new THREE.AmbientLight(0x6C63FF, 0.4);
        this.scene.add(ambientLight);

        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(5, 5, 7);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        this.scene.add(mainLight);

        // Accent lights for dramatic effect
        const accent1 = new THREE.PointLight(0x00ff88, 2, 10);
        accent1.position.set(-5, 3, 5);
        this.scene.add(accent1);

        const accent2 = new THREE.PointLight(0xff0088, 2, 10);
        accent2.position.set(5, -3, 5);
        this.scene.add(accent2);
    }

    async loadModels() {
        try {
            await Promise.all([
                this.loadMailboxModel(),
                this.loadAvatarSystem(),
                this.loadEmailEnvironment(),
                this.createNotificationSystem(),
                this.createEmailIcons()
            ]);
        } catch (error) {
            console.error('Error loading models:', error);
        }
    }

    async loadMailboxModel() {
        // Load the Dmitriy Kozlov mailbox model
        const mailboxModel = await this.gltfLoader.loadAsync('models/mailbox/scene.gltf');
        this.mailbox = mailboxModel.scene;
        this.mailbox.position.set(-2, 0, 0);
        this.mailbox.scale.set(0.5, 0.5, 0.5);
        this.scene.add(this.mailbox);

        // Setup mailbox animations
        const mixer = new THREE.AnimationMixer(this.mailbox);
        this.mixers.push(mixer);
        mailboxModel.animations.forEach(clip => {
            const action = mixer.clipAction(clip);
            this.activeAnimations.set(clip.name, action);
        });

        // Add interaction handlers
        this.interactiveObjects.set(this.mailbox, {
            hover: () => this.handleMailboxHover(),
            click: () => this.handleMailboxClick()
        });
    }

    async loadAvatarSystem() {
        this.avatarSystem = new AvatarSystem(this.scene, this.gltfLoader);
        await this.avatarSystem.initialize();
    }

    async loadEmailEnvironment() {
        // Load the CG Geeks email hub environment
        const environment = await this.gltfLoader.loadAsync('models/email-hub/scene.gltf');
        this.emailHub = environment.scene;
        this.emailHub.position.set(0, -2, -10);
        this.emailHub.scale.set(2, 2, 2);
        this.scene.add(this.emailHub);

        // Add environment interactions
        this.setupEnvironmentInteractions();
    }

    setupEnvironmentInteractions() {
        // Add clickable hotspots in the environment
        const hotspots = [
            { position: new THREE.Vector3(2, 1, -8), action: 'compose' },
            { position: new THREE.Vector3(-2, 1, -8), action: 'inbox' },
            { position: new THREE.Vector3(0, 2, -9), action: 'settings' }
        ];

        hotspots.forEach(hotspot => {
            const marker = this.createHotspotMarker();
            marker.position.copy(hotspot.position);
            this.emailHub.add(marker);

            this.interactiveObjects.set(marker, {
                hover: () => this.handleHotspotHover(marker),
                click: () => this.handleHotspotClick(hotspot.action)
            });
        });
    }

    createHotspotMarker() {
        const geometry = new THREE.SphereGeometry(0.2, 16, 16);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x00ff88,
            emissive: 0x00ff88,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.8
        });
        return new THREE.Mesh(geometry, material);
    }

    // Avatar System Class
    class AvatarSystem {
        constructor(scene, loader) {
            this.scene = scene;
            this.loader = loader;
            this.avatars = new Map();
            this.currentAvatar = null;
            this.animations = new Map();
        }

        async initialize() {
            await this.loadAvatarModels();
            this.setupAvatarCustomization();
            this.setupAvatarAnimations();
        }

        async loadAvatarModels() {
            // Load base avatar model
            const baseAvatar = await this.loader.loadAsync('models/avatar/base.glb');
            this.baseAvatar = baseAvatar.scene;

            // Load customization options
            const customizationParts = [
                'hair', 'face', 'body', 'accessories'
            ];

            for (const part of customizationParts) {
                const options = await this.loadCustomizationOptions(part);
                this.avatars.set(part, options);
            }
        }

        async loadCustomizationOptions(part) {
            const options = [];
            // Load multiple variations for each part
            for (let i = 1; i <= 5; i++) {
                const model = await this.loader.loadAsync(`models/avatar/${part}${i}.glb`);
                options.push(model.scene);
            }
            return options;
        }

        setupAvatarCustomization() {
            // Create UI for avatar customization
            const customizationUI = document.createElement('div');
            customizationUI.className = 'avatar-customization';
            // Add customization controls
            this.createCustomizationControls(customizationUI);
            document.body.appendChild(customizationUI);
        }

        createCustomizationControls(container) {
            const parts = ['hair', 'face', 'body', 'accessories'];
            parts.forEach(part => {
                const control = document.createElement('div');
                control.className = 'customization-control';
                control.innerHTML = `
                    <h3>${part.charAt(0).toUpperCase() + part.slice(1)}</h3>
                    <div class="options">
                        ${this.avatars.get(part).map((_, index) => `
                            <button data-part="${part}" data-index="${index}">
                                Option ${index + 1}
                            </button>
                        `).join('')}
                    </div>
                `;
                container.appendChild(control);

                // Add event listeners
                control.querySelectorAll('button').forEach(button => {
                    button.addEventListener('click', () => {
                        this.updateAvatarPart(
                            button.dataset.part,
                            parseInt(button.dataset.index)
                        );
                    });
                });
            });
        }

        updateAvatarPart(part, index) {
            const options = this.avatars.get(part);
            if (options && options[index]) {
                // Remove current part
                const currentPart = this.currentAvatar.getObjectByName(part);
                if (currentPart) {
                    this.currentAvatar.remove(currentPart);
                }
                // Add new part
                const newPart = options[index].clone();
                newPart.name = part;
                this.currentAvatar.add(newPart);
            }
        }

        setupAvatarAnimations() {
            // Load and setup animations
            const animations = [
                'idle', 'wave', 'talk', 'walk'
            ];

            animations.forEach(async animName => {
                const anim = await this.loader.loadAsync(`models/avatar/animations/${animName}.glb`);
                this.animations.set(animName, anim.animations[0]);
            });
        }

        playAnimation(animationName) {
            const animation = this.animations.get(animationName);
            if (animation && this.currentAvatar) {
                const mixer = new THREE.AnimationMixer(this.currentAvatar);
                const action = mixer.clipAction(animation);
                action.play();
            }
        }
    }

    // Notification System
    createNotificationSystem() {
        this.notificationSystem = new NotificationSystem(this.scene);
    }

    class NotificationSystem {
        constructor(scene) {
            this.scene = scene;
            this.bubbles = new Map();
            this.setupBubbleGeometry();
        }

        setupBubbleGeometry() {
            this.bubbleGeometry = new THREE.SphereGeometry(0.2, 32, 32);
            this.bubbleMaterial = new THREE.MeshPhysicalMaterial({
                color: 0x00ff88,
                transmission: 0.5,
                thickness: 0.5,
                roughness: 0,
                metalness: 0
            });
        }

        createNotification(message, position) {
            const bubble = new THREE.Mesh(this.bubbleGeometry, this.bubbleMaterial);
            bubble.position.copy(position);
            
            // Add text
            const text = this.createText(message);
            bubble.add(text);

            this.scene.add(bubble);
            this.bubbles.set(message, bubble);

            // Animate
            this.animateNotification(bubble);
            
            // Auto-remove after delay
            setTimeout(() => this.removeNotification(message), 3000);
        }

        createText(message) {
            // Create text sprite
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            context.font = '48px Arial';
            context.fillStyle = 'white';
            context.fillText(message, 0, 48);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1, 0.5, 1);
            sprite.position.y = 0.3;

            return sprite;
        }

        animateNotification(bubble) {
            gsap.to(bubble.position, {
                y: '+=1',
                duration: 1,
                ease: 'power2.out'
            });

            gsap.to(bubble.scale, {
                x: 1.2,
                y: 1.2,
                z: 1.2,
                duration: 0.3,
                yoyo: true,
                repeat: 1
            });
        }

        removeNotification(message) {
            const bubble = this.bubbles.get(message);
            if (bubble) {
                gsap.to(bubble.scale, {
                    x: 0,
                    y: 0,
                    z: 0,
                    duration: 0.3,
                    onComplete: () => {
                        this.scene.remove(bubble);
                        this.bubbles.delete(message);
                    }
                });
            }
        }
    }

    async createNotificationBubbles() {
        const geometry = new THREE.SphereGeometry(0.2, 32, 32);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x00ff88,
            transmission: 0.5,
            thickness: 0.5,
            roughness: 0,
            metalness: 0
        });

        this.notificationBubbles = new THREE.Group();
        
        for (let i = 0; i < 5; i++) {
            const bubble = new THREE.Mesh(geometry, material);
            bubble.position.set(
                Math.random() * 4 - 2,
                Math.random() * 4 - 2,
                Math.random() * 4 - 2
            );
            this.notificationBubbles.add(bubble);
        }

        this.scene.add(this.notificationBubbles);
    }

    async createEmailIcons() {
        const iconGeometry = new THREE.BoxGeometry(0.5, 0.4, 0.1);
        const iconMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x6C63FF,
            metalness: 0.8,
            roughness: 0.2,
            clearcoat: 1.0
        });

        this.emailIcons = new THREE.Group();

        for (let i = 0; i < 3; i++) {
            const icon = new THREE.Mesh(iconGeometry, iconMaterial);
            icon.position.set(i * 1 - 1, 2, 0);
            this.emailIcons.add(icon);

            // Add hover interaction
            this.interactiveObjects.set(icon, {
                hover: () => this.handleIconHover(icon),
                click: () => this.handleIconClick(icon)
            });
        }

        this.scene.add(this.emailIcons);
    }

    setupPostProcessing() {
        this.composer = new EffectComposer(this.renderer);
        
        // Basic render pass
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        // Bloom effect
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        this.composer.addPass(bloomPass);
    }

    addInteractivity() {
        // Mouse movement
        window.addEventListener('mousemove', (event) => {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / 500) * 2 + 1;
            this.handleMouseInteraction();
        });

        // Click events
        window.addEventListener('click', () => {
            this.handleClick();
        });
    }

    handleMouseInteraction() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.interactiveObjects.keys()), true
        );

        // Reset all objects
        this.interactiveObjects.forEach((handlers, object) => {
            object.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
        });

        // Handle intersections
        if (intersects.length > 0) {
            const object = intersects[0].object;
            const handlers = this.interactiveObjects.get(object);
            if (handlers && handlers.hover) {
                handlers.hover();
            }
        }
    }

    handleClick() {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(
            Array.from(this.interactiveObjects.keys()), true
        );

        if (intersects.length > 0) {
            const object = intersects[0].object;
            const handlers = this.interactiveObjects.get(object);
            if (handlers && handlers.click) {
                handlers.click();
            }
        }
    }

    // Animation handlers
    handleMailboxHover() {
        if (this.mailbox) {
            this.mailbox.scale.lerp(new THREE.Vector3(0.55, 0.55, 0.55), 0.1);
        }
    }

    handleMailboxClick() {
        if (this.mailbox) {
            const openAction = this.activeAnimations.get('open');
            if (openAction) {
                openAction.reset().play();
            }
            // Trigger email generation
            window.emailDispenser.generateNewEmail();
        }
    }

    handleIconHover(icon) {
        icon.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
    }

    handleIconClick(icon) {
        // Trigger notification animation
        this.triggerNotification();
    }

    triggerNotification() {
        this.notificationBubbles.children.forEach((bubble, index) => {
            gsap.to(bubble.position, {
                y: bubble.position.y + 2,
                duration: 1,
                delay: index * 0.1,
                ease: "power2.out",
                onComplete: () => {
                    bubble.position.y -= 2;
                }
            });
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // Update animations
        this.mixers.forEach(mixer => mixer.update(delta));

        // Update notification bubbles
        this.notificationBubbles.children.forEach(bubble => {
            bubble.rotation.y += delta * 0.5;
            bubble.position.y += Math.sin(this.clock.getElapsedTime() + bubble.position.x) * 0.01;
        });

        // Update email icons
        this.emailIcons.children.forEach((icon, index) => {
            icon.rotation.y = Math.sin(this.clock.getElapsedTime() + index) * 0.2;
        });

        // Render scene with post-processing
        this.composer.render();
    }

    handleResize() {
        const width = window.innerWidth;
        const height = 500;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);
    }
}

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    const emailHub = new FuturisticEmailHub();
}); 