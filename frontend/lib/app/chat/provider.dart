import 'package:flutter/material.dart';
import 'package:frontend/app/model/chat_message.dart';
import 'package:frontend/app/service/chat_service.dart';

class ChatProvider with ChangeNotifier {
  final List<ChatMessage> _messages = [];
  final _service = ChatService();
  final String _userId = "user123"; // can be dynamic later

  List<ChatMessage> get messages => _messages;

  Future<void> sendMessage(String message) async {
    _messages.add(ChatMessage(text: message, isUser: true));
    notifyListeners();

    final response = await _service.sendMessage(message, _userId);
    _messages.add(ChatMessage(text: response['reply'], isUser: false));
    notifyListeners();
  }
}
