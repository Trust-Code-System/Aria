'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ThreeJSViewer() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    // Aria Mascot: 3D Robot Head (Glossy Sphere)
    const headGroup = new THREE.Group();

    // Main Head Sphere
    const headGeometry = new THREE.SphereGeometry(1, 64, 64);
    const headMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      shininess: 100,
      transparent: true,
      opacity: 0.9,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    headGroup.add(head);

    // Eyes (Glowing Cyan)
    const eyeGeo = new THREE.SphereGeometry(0.1, 32, 32);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(0.35, 0.2, 0.9);
    headGroup.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(-0.35, 0.2, 0.9);
    headGroup.add(rightEye);

    // Smile (Small curved arc)
    const smileCurve = new THREE.EllipseCurve(0, 0, 0.3, 0.2, 3.5, 6, false, 0);
    const points = smileCurve.getPoints(50);
    const smileGeo = new THREE.BufferGeometry().setFromPoints(points);
    const smileMat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    const smile = new THREE.Line(smileGeo, smileMat);
    smile.rotation.x = Math.PI / 2.5;
    smile.position.set(0, -0.2, 0.85);
    headGroup.add(smile);

    scene.add(headGroup);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x4f46e5, 15, 10);
    pointLight.position.set(2, 2, 5);
    scene.add(pointLight);

    camera.position.z = 3;

    // Mouse Tracking
    let mouseX = 0;
    let mouseY = 0;
    const targetRotation = new THREE.Euler();

    const onMouseMove = (e: MouseEvent) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', onMouseMove);

    let reqId: number;
    function animate() {
      reqId = requestAnimationFrame(animate);

      // Smooth hover motion
      headGroup.position.y = Math.sin(Date.now() * 0.001) * 0.1;

      // Follow mouse
      targetRotation.y = mouseX * 0.5;
      targetRotation.x = -mouseY * 0.3;

      headGroup.rotation.y += (targetRotation.y - headGroup.rotation.y) * 0.05;
      headGroup.rotation.x += (targetRotation.x - headGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    }

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', onResize);

    animate();

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none -z-10">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
