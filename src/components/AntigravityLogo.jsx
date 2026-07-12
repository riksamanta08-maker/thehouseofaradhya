import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import {
    Float,
    Environment,
    Stars,
    ContactShadows,
    Text3D,
    Center,
} from '@react-three/drei';
import * as THREE from 'three';

// Interactive wrapper that directly follows mouse movement
function InteractiveModel({ children, mouse }) {
    const ref = useRef();

    useFrame(() => {
        if (ref.current) {
            // Full 360-degree rotation based on mouse position
            // Math.PI * 2 = 360 degrees (full rotation)
            ref.current.rotation.y = mouse.x * Math.PI * 2;  // Horizontal 360° rotation
            ref.current.rotation.x = mouse.y * Math.PI;      // Vertical 180° rotation
        }
    });

    return <group ref={ref}>{children}</group>;
}

// Fallback text component if STL is not available
function FloatingText() {
    return (
        <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1} floatingRange={[0, 0.5]}>
            <Center>
                <Text3D
                    font="/fonts/helvetiker_regular.typeface.json"
                    size={3}
                    height={0.5}
                    curveSegments={12}
                    bevelEnabled
                    bevelThickness={0.1}
                    bevelSize={0.05}
                    bevelOffset={0}
                    bevelSegments={5}
                >
                    EVRYDAE
                    <meshStandardMaterial
                        color="#ffffff"
                        metalness={1.0}
                        roughness={0.05}
                        side={THREE.DoubleSide}
                    />
                </Text3D>
            </Center>
        </Float>
    );
}

// Component to load STL model
function FloatingSTLModel({ stlPath }) {
    const geometry = useLoader(STLLoader, stlPath);

    return (
        <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1} floatingRange={[0, 0.5]}>
            <mesh geometry={geometry} rotation={[0, 0, 0]} scale={0.30}>
                <meshStandardMaterial
                    color="#ffffff"
                    metalness={1.0}
                    roughness={0.05}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </Float>
    );
}

export default function AntigravityLogo({ stlPath = null, className = '' }) {
    const mouse = useRef({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        // Normalize mouse position (-1 to 1)
        mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };

    return (
        <div
            className={`h-full w-full ${className}`}
            onMouseMove={handleMouseMove}
        >
            <Canvas camera={{ position: [0, 0, 120], fov: 45 }}>
                {/* LIGHTING & REFLECTIONS */}
                <ambientLight intensity={0.6} />
                <spotLight position={[100, 100, 100]} angle={0.15} penumbra={1} intensity={3000} />
                <pointLight position={[-50, -50, -50]} intensity={1000} />
                <Environment preset="city" />

                {/* INTERACTIVE FLOATING MODEL */}
                <Suspense fallback={null}>
                    <InteractiveModel mouse={mouse.current}>
                        {stlPath ? <FloatingSTLModel stlPath={stlPath} /> : <FloatingText />}
                    </InteractiveModel>
                </Suspense>

                {/* ATMOSPHERE - Reduced stars */}
                <Stars radius={100} depth={50} count={2000} factor={3} saturation={0} fade speed={1} />

                {/* SHADOW ON THE 'FLOOR' */}
                <ContactShadows position={[0, -15, 0]} opacity={0.3} scale={30} blur={2} far={30} />
            </Canvas>
        </div>
    );
}
