// main.dart
import 'package:flutter/material.dart';
import 'package:frontend/app/chat/chat_screen.dart';
import 'package:frontend/app/chat/provider.dart';
import 'package:provider/provider.dart';

void main() {
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ChatProvider()),
      ],
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        home: ChatScreen(),
      ),
    ),
  );
}
